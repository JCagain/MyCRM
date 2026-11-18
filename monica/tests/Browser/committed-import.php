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
echo "Committed actual-download import passed: valid avatar, repeated Replace and rejected-card file isolation.\n";
