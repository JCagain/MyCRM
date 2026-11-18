<?php
// Fictional browser data only. This is not an application command.
require __DIR__.'/../../vendor/autoload.php';
$app=require __DIR__.'/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
set_exception_handler(function (Throwable $error) { fwrite(STDERR,$error->getMessage().PHP_EOL);exit(1); });
if (! app()->environment('testing') || config('database.connections.mysql.database')!=='fictional' || config('database.connections.mysql.host')!=='db') {
    throw new RuntimeException('This fixture requires the isolated fictional Compose database.');
}
Illuminate\Support\Facades\Hash::setRounds(4);
$user=App\Models\User\User::where('email','monica-browser@example.invalid')->first();
if (! $user) {
    $account=factory(App\Models\Account\Account::class)->create();$account->populateDefaultFields();
    $user=factory(App\Models\User\User::class)->create(['account_id'=>$account->id,'first_name'=>'Fictional','last_name'=>'Reviewer','email'=>'monica-browser@example.invalid','password'=>bcrypt('fictional-browser-only'),'email_verified_at'=>now()]);
    $term=App\Models\Settings\Term::latest()->first() ?? factory(App\Models\Settings\Term::class)->create();
    $user->terms()->attach($term->id,['account_id'=>$account->id,'ip_address'=>'127.0.0.1']);
}
$result=app(App\Services\VCard\ImportVCard::class)->execute(['account_id'=>$user->account_id,'user_id'=>$user->id,'entry'=>file_get_contents('/tmp/c2v-fictional.vcf'),'behaviour'=>App\Services\VCard\ImportVCard::BEHAVIOUR_REPLACE]);
if (isset($result['error'])) throw new RuntimeException('Fictional browser import failed: '.$result['error']);
$contact=App\Models\Contact\Contact::findOrFail($result['contact_id']);
App\Models\Contact\ContactField::where('account_id',$user->account_id)->where('data','browser-fictional-wechat')->get()->each->delete();
Illuminate\Support\Facades\DB::table('tags')->where('account_id',$user->account_id)->where('name','Browser tag')->delete();
Illuminate\Support\Facades\DB::table('tag_categories')->where('account_id',$user->account_id)->where('name','Browser category')->delete();
echo json_encode(['profile'=>route('people.show',$contact,false),'work'=>route('people.work.edit',$contact,false)]).PHP_EOL;
