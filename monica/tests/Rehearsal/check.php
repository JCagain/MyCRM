<?php
require '/var/www/html/vendor/autoload.php';
$app=require '/var/www/html/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
set_exception_handler(function (Throwable $error) { fwrite(STDERR,$error->getMessage().PHP_EOL);exit(1); });
if (! app()->environment('testing') || config('database.connections.mysql.database')!=='fictional' || ! in_array(config('database.connections.mysql.host'),['db','recovery-db'],true)) throw new RuntimeException('Isolated fictional rehearsal required.');
$mode=$argv[1] ?? '';
$db=Illuminate\Support\Facades\DB::class;
$schema=Illuminate\Support\Facades\Schema::class;
if ($mode==='seed') {
    if ($schema::hasTable('job_variants') || $db::table('accounts')->exists()) throw new RuntimeException('Seed requires a new legacy fictional database.');
    $account=App\Models\Account\Account::create(['api_key'=>'fictional-rehearsal-only']);$account->populateDefaultFields();
    $contact=App\Models\Contact\Contact::create(['account_id'=>$account->id,'first_name'=>'Fictional legacy','company'=>'Flat Example','job'=>'Director','default_avatar_color'=>'#ffffff']);
    $company=App\Models\Account\Company::create(['account_id'=>$account->id,'name'=>'Occupation Example']);
    App\Models\Contact\Occupation::create(['account_id'=>$account->id,'contact_id'=>$contact->id,'company_id'=>$company->id,'title'=>'Researcher','currently_works_here'=>false,'start_date'=>'2011-02-03','end_date'=>'2015-06-07']);
    $tag=App\Models\Contact\Tag::create(['account_id'=>$account->id,'name'=>'Legacy tag','name_slug'=>'legacy-tag']);$contact->tags()->attach($tag->id,['account_id'=>$account->id]);
    Illuminate\Support\Facades\Storage::put('fictional-rehearsal.txt','pre-upgrade-fictional-storage');
    echo "Legacy conflicting work, dates, tag and storage fixtures created.\n";exit(0);
}
$contact=App\Models\Contact\Contact::where('first_name','Fictional legacy')->firstOrFail();
if ($contact->company!=='Flat Example' || $contact->job!=='Director' || $contact->tags()->count()!==1) throw new RuntimeException('Original flat work or tags were not preserved.');
$legacy=$contact->occupations()->where('title','Researcher')->firstOrFail();
if ($legacy->start_date->toDateString()!=='2011-02-03' || $legacy->end_date->toDateString()!=='2015-06-07' || $legacy->currently_works_here) throw new RuntimeException('Legacy occupation dates/status changed.');
if (Illuminate\Support\Facades\Storage::get('fictional-rehearsal.txt')!=='pre-upgrade-fictional-storage') throw new RuntimeException('Matching storage backup was not restored.');
if ($mode==='upgraded') {
    if ($contact->occupations()->count()!==2 || $legacy->status!=='former' || $db::table('job_variants')->count()!==2 || $contact->primary_occupation_id===null) throw new RuntimeException('Upgrade/backfill did not preserve both work representations.');
} elseif ($mode==='restored') {
    if ($schema::hasTable('job_variants') || $contact->occupations()->count()!==1) throw new RuntimeException('Recovery did not restore the pre-upgrade schema.');
} else throw new RuntimeException('Unknown rehearsal check.');
echo "Fictional $mode database/storage verification passed.\n";
