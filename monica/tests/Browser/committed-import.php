<?php
require __DIR__.'/../../vendor/autoload.php';
$app=require __DIR__.'/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
set_exception_handler(function (Throwable $error) { fwrite(STDERR,$error->getMessage().PHP_EOL);exit(1); });
if (! app()->environment('testing') || config('database.connections.mysql.database')!=='fictional' || config('database.connections.mysql.host')!=='db') {
    throw new RuntimeException('This check requires the isolated fictional Compose database.');
}
Illuminate\Support\Facades\Hash::setRounds(4);
$account=factory(App\Models\Account\Account::class)->create();$account->populateDefaultFields();
$user=factory(App\Models\User\User::class)->create(['account_id'=>$account->id]);
$source=file_get_contents('/tmp/c2v-handoff/structured-combined.vcf');
$input=['account_id'=>$account->id,'user_id'=>$user->id,'entry'=>$source,'behaviour'=>App\Services\VCard\ImportVCard::BEHAVIOUR_REPLACE];
$first=app(App\Services\VCard\ImportVCard::class)->execute($input);
if (isset($first['error'])) throw new RuntimeException('Fictional committed import failed.');
$person=App\Models\Contact\Contact::findOrFail($first['contact_id']);
if ($person->avatar_source!=='photo' || $person->photos()->count()!==1) throw new RuntimeException('The existing first-PHOTO avatar policy failed: source='.($person->avatar_source ?? 'null').', photos='.$person->photos()->count());
$photo=$person->photos()->first();
$bytes=Illuminate\Support\Facades\Storage::get($photo->new_filename);
if (! getimagesizefromstring($bytes)) throw new RuntimeException('The committed avatar file cannot be decoded.');
$again=app(App\Services\VCard\ImportVCard::class)->execute($input);
if (($again['contact_id'] ?? null)!==$person->id || $person->fresh()->avatar_photo_id!==$photo->id || $person->photos()->count()!==1) throw new RuntimeException('Repeated Replace duplicated the person or avatar.');
$rejected=app(App\Services\VCard\ImportVCard::class)->execute(array_replace($input,['entry'=>str_replace('VALUE=text:current','VALUE=text:invalid',$source)]));
if (($rejected['error'] ?? null)!=='ERROR_ORGANIZATION_METADATA' || $person->photos()->count()!==1) throw new RuntimeException('Rejected metadata changed committed photos.');

$image = imagecreatetruecolor(4, 3);
imagefill($image, 0, 0, imagecolorallocate($image, 80, 140, 190));
ob_start();
imagepng($image);
$alternate = base64_encode(ob_get_clean());

$card = Sabre\VObject\Reader::read($source);
$card->add('PHOTO', 'data:image/png;base64,invalid');
$card->add('PHOTO', 'https://example.invalid/remote.png');
$card->add('PHOTO', 'data:image/png;base64,'.$alternate);
$input['entry'] = $card->serialize();

$updated = app(App\Services\VCard\ImportVCard::class)->execute($input);
if (($updated['contact_id'] ?? null) !== $person->id || $person->photos()->count() !== 2
    || $person->fresh()->avatar_photo_id !== $photo->id) {
    throw new RuntimeException('Replace did not add the distinct embedded photo while retaining the avatar.');
}
$second = $person->photos()->where('photos.id', '!=', $photo->id)->firstOrFail();
[$width, $height] = getimagesizefromstring(Illuminate\Support\Facades\Storage::get($second->new_filename));
if ($width !== 4 || $height !== 3) {
    throw new RuntimeException('The additional photo file is missing or invalid.');
}

app(App\Services\Contact\Avatar\UpdateAvatar::class)->execute([
    'account_id' => $account->id,
    'contact_id' => $person->id,
    'source' => 'photo',
    'photo_id' => $second->id,
]);
$again = app(App\Services\VCard\ImportVCard::class)->execute($input);
if (($again['contact_id'] ?? null) !== $person->id || $person->fresh()->avatar_photo_id !== $second->id
    || $person->photos()->count() !== 2 || ! Illuminate\Support\Facades\Storage::exists($photo->new_filename)) {
    throw new RuntimeException('Changing the avatar and reimporting did not preserve the two photos.');
}

$legacy = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Legacy Fictional\r\nN:Fictional;Legacy;;;\r\n"
    ."PHOTO;TYPE=PNG;ENCODING=b:".$alternate."\r\n"
    ."PHOTO;TYPE=PNG;ENCODING=b:".base64_encode($bytes)."\r\nEND:VCARD\r\n";
$legacyResult = app(App\Services\VCard\ImportVCard::class)->execute(array_replace($input, ['entry' => $legacy]));
$legacyContact = App\Models\Contact\Contact::findOrFail($legacyResult['contact_id']);
if ($legacyContact->photos()->count() !== 2
    || $legacyContact->avatar_photo_id !== $legacyContact->photos()->orderBy('photos.id')->firstOrFail()->id) {
    throw new RuntimeException('vCard 3.0 did not save both photos and use the first for the avatar.');
}

echo "Committed import passed for vCard 3.0 and 4.0 photos, avatar changes, repeated Replace and rejected cards.\n";
