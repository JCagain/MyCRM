<?php
namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Account\Account;
use App\Models\Account\Company;
use App\Models\Account\ImportJobReport;
use App\Models\Contact\Contact;
use App\Models\Contact\ContactField;
use App\Models\Contact\ContactFieldType;
use App\Models\Contact\Occupation;
use App\Models\Contact\Tag;
use App\Models\User\User;
use App\Services\Organization\Backfill;
use App\Services\Organization\Batch;
use App\Services\Organization\Defaults;
use App\Services\Organization\PeopleQuery;
use App\Services\Organization\Work;
use App\Services\VCard\ImportVCard;
use App\Services\VCard\OrganizationCard;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Validation\ValidationException;
use Sabre\VObject\Reader;

class OrganizationTest extends TestCase
{
    use DatabaseTransactions;
    private function account(): Account { $a=factory(Account::class)->create();$a->populateDefaultFields();return $a; }
    private function contact(Account $a): Contact { return factory(Contact::class)->create(['account_id'=>$a->id,'company'=>null,'job'=>null,'is_active'=>true,'is_partial'=>false,'is_dead'=>false]); }
    private function source(): string { return file_get_contents('/tmp/c2v-fictional.vcf'); }
    private function import(Account $a,string $entry,string $mode=ImportVCard::BEHAVIOUR_ADD): array {
        $user=User::where('account_id',$a->id)->first() ?? factory(User::class)->create(['account_id'=>$a->id]);
        return app(ImportVCard::class)->execute(['account_id'=>$a->id,'user_id'=>$user->id,'entry'=>$entry,'behaviour'=>$mode]);
    }
    public function test_replace_preserves_job_identity_and_exact_contact_methods(): void
    {
        Queue::fake();
        $account = $this->account();
        $contact = $this->contact($account);
        $work = app(Work::class);
        $alpha = $work->save($contact, [['company' => 'Alpha', 'title' => 'Advisor']]);
        $alpha->update(['start_date' => '2001-01-01']);
        $beta = $work->save($contact, [['company' => 'Beta', 'title' => 'Engineer']]);
        $beta->update(['start_date' => '2020-01-01']);
        $entry = "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Fictional\r\nUID:{$contact->uuid}\r\n"
            ."job1.ORG:Beta\r\njob1.TITLE:Engineer\r\njob2.ORG:Alpha\r\njob2.TITLE:Advisor\r\n"
            ."X-SOCIALPROFILE;VALUE=text;TYPE=linkedin:Abc\r\nX-SOCIALPROFILE;VALUE=text;TYPE=linkedin:abc\r\nEND:VCARD\r\n";
        for ($i = 0; $i < 2; $i++) {
            $this->assertArrayNotHasKey('error', $this->import($account, $entry, ImportVCard::BEHAVIOUR_REPLACE));
            $this->assertSame([$beta->id, $alpha->id], $contact->occupations()->orderBy('position')->pluck('id')->all());
            $this->assertSame($beta->id, $contact->fresh()->primary_occupation_id);
            $this->assertSame('2001-01-01', $alpha->fresh()->start_date->toDateString());
            $this->assertSame('2020-01-01', $beta->fresh()->start_date->toDateString());
            $this->assertSame(['Abc', 'abc'], $contact->contactFields()->orderBy('id')->pluck('data')->all());
        }

        $work->save($contact->fresh(), [['company' => 'Alpha', 'title' => 'Advisor']]);
        $this->assertSame('ERROR_JOB_IDENTITY', $this->import($account, $entry, ImportVCard::BEHAVIOUR_REPLACE)['error']);
        $this->assertSame(3, $contact->occupations()->count());
    }

    public function test_backfill_reuses_unique_alias_and_leaves_ambiguous_company_unresolved(): void
    {
        $account = $this->account();
        $work = app(Work::class);
        $company = $work->resolve($account->id, ['Legacy Name', 'Printed Alias']);
        $work->resolve($account->id, ['Ambiguous'], 'new');
        $work->resolve($account->id, ['Ambiguous'], 'new');
        foreach ([['Printed Alias', 'Advisor', $company], ['Printed Alias', 'Director', $company], ['Ambiguous', 'Engineer', null]] as [$name, $title, $expected]) {
            $contact = $this->contact($account);
            $contact->update(['company' => $name, 'job' => $title]);
            app(Backfill::class)->contact($contact);
            $job = $contact->occupations()->firstOrFail();
            app(Backfill::class)->contact($contact->fresh());
            $this->assertSame($job->id, $contact->fresh()->primary_occupation_id);
            $this->assertSame($expected, $job->fresh()->company_id);
            $this->assertSame($name, $job->variants()->first()->company);
            $this->assertSame(1, $contact->occupations()->count());
        }
        $this->assertSame(3, Company::where('account_id', $account->id)->count());
    }

    public function test_review_updates_the_original_report_and_worker_keeps_the_totals(): void
    {
        Queue::fake();
        $account = $this->account();
        $user = factory(User::class)->create(['account_id' => $account->id]);
        app(\App\Services\User\AcceptPolicy::class)->execute(['account_id' => $account->id, 'user_id' => $user->id, 'ip_address' => null]);
        factory(Company::class, 2)->create(['account_id' => $account->id, 'name' => 'Ambiguous']);
        $job = \App\Models\Account\ImportJob::create([
            'account_id' => $account->id, 'user_id' => $user->id, 'filename' => 'fictional.vcf',
            'contacts_imported' => 0, 'contacts_skipped' => 0, 'contacts_found' => 2,
        ]);
        $entry = fn ($name, $work = '') => "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:$name\r\nN:;$name;;;\r\n".$work."END:VCARD\r\n";
        $process = new \ReflectionMethod($job, 'processSingleEntry');
        $process->invoke($job, $entry('Fictional first'));
        $process->invoke($job, $entry('Fictional pending', "ORG:Ambiguous\r\nTITLE:Advisor\r\n"));
        $report = $job->importJobReports()->where('skipped', true)->firstOrFail();
        $id = $report->organization_review_id;
        $this->assertNotNull($id);
        $this->assertEquals(1, $job->fresh()->contacts_skipped);
        $this->actingAs($user)->post(route('organization.resolve-review', $id), ['company_choices' => [0 => 'new']])->assertRedirect();
        $this->post(route('organization.resolve-review', $id), ['company_choices' => [0 => 'new']])->assertNotFound();
        // Simulate the original worker finalizing with an in-memory copy from before resolution.
        (new \ReflectionMethod($job, 'endJob'))->invoke($job);
        $this->assertEquals(2, $job->contacts_imported);
        $this->assertEquals(0, $job->contacts_skipped);
        $this->assertEquals(2, $job->contacts_found);
        $this->assertFalse((bool) $report->fresh()->skipped);
        $this->assertNull($report->fresh()->skip_reason);
        $this->assertNull($report->fresh()->organization_review_id);

        $process->invoke($job, $entry('Fictional expired', "ORG:Ambiguous\r\nTITLE:Advisor\r\n"));
        $expired = $job->importJobReports()->where('skipped', true)->firstOrFail();
        DB::table('organization_import_reviews')->where('id', $expired->organization_review_id)
            ->update(['expires_at' => now()->subMinute()]);
        $this->get('/settings/import/report/'.$job->id)->assertOk()->assertDontSee('Review company matches');
        $this->post(route('organization.resolve-review', $expired->organization_review_id), ['skip' => true])->assertNotFound();
        $process->invoke($job, $entry('Fictional skipped', "ORG:Ambiguous\r\nTITLE:Advisor\r\n"));
        $skipped = $job->importJobReports()->latest('id')->firstOrFail();
        $this->get('/settings/import/report/'.$job->id)->assertOk()->assertSee('Review company matches');
        $this->post(route('organization.resolve-review', $skipped->organization_review_id), ['skip' => true])->assertRedirect();
        $this->assertNull($skipped->fresh()->organization_review_id);
        $this->assertEquals(2, $job->fresh()->contacts_skipped);
    }

    public function test_carddav_logs_safe_outcomes_and_reports_a_sanitized_failure(): void
    {
        $user = factory(User::class)->create();
        $contact = new \App\Services\DavClient\Utils\Model\ContactUpdateDto('', 'fictional-etag', 'fictional-card-and-photo');
        $this->mock(\App\Http\Controllers\DAV\Backend\CardDAV\CardDAVBackend::class, function ($backend) {
            $backend->shouldReceive('init')->andReturnSelf();
            $backend->shouldReceive('backendUri')->andReturn('fictional-book');
        });
        $this->mock(ImportVCard::class, function ($import) {
            $import->shouldReceive('execute')->once()->ordered()->andReturn(['error' => 'ERROR_COMPANY_REVIEW']);
            $import->shouldReceive('execute')->once()->ordered()->andReturn(['contact_id' => 1]);
            $import->shouldReceive('execute')->once()->ordered()->andThrow(new \RuntimeException('fictional-card-and-photo'));
        });
        $this->mock(\App\Services\VCard\GetEtag::class, fn ($etag) => $etag->shouldReceive('execute')->once()->andReturn('different-fictional-etag'));
        \Illuminate\Support\Facades\Log::shouldReceive('warning')->once()->with('CardDAV contact update requires company review.');
        \Illuminate\Support\Facades\Log::shouldReceive('warning')->once()->with('CardDAV contact update returned an unexpected ETag.');
        $job = new class($user, 'fictional-book', $contact) extends \App\Jobs\Dav\UpdateVCard {
            public function batching() { return true; }
        };
        $job->handle();
        $job->handle();
        try {
            $job->handle();
            $this->fail('Expected a queue failure.');
        } catch (\RuntimeException $exception) {
            $this->assertSame('CardDAV contact update failed.', $exception->getMessage());
            $this->assertNull($exception->getPrevious());
        }
    }

    public function test_actual_converter_output_imports_complete_graph_and_replaces_without_duplicates()
    {
        Queue::fake();$a=$this->account();$result=$this->import($a,$this->source());$this->assertArrayNotHasKey('error',$result);
        $p=Contact::findOrFail($result['contact_id']);$jobs=$p->occupations()->orderBy('position')->get();
        $this->assertCount(5,$jobs);$this->assertCount(2,$jobs[0]->variants);
        $this->assertSame(['unspecified','former','current','unspecified','former'],$jobs->pluck('status')->all());
        $this->assertSame('Example',$p->company);$this->assertSame('Advisor',$p->job);$this->assertNull($jobs[4]->company_id);
        $this->assertSame('Fictional nickname',$p->nickname);$this->assertStringContainsString('https://example.invalid/fictional',$p->notes()->first()->body);$this->assertStringContainsString('First met occasion: Fictional conference',$p->notes()->first()->body);
        $addresses=$p->addresses()->orderBy('id')->get();$this->assertCount(3,$addresses);$this->assertSame($addresses[0]->alternative_group,$addresses[1]->alternative_group);$this->assertNull($addresses[2]->alternative_group);
        $phone=$p->contactFields()->phone()->first();$bound=$p->contactFields()->where('phone_id',$phone->id)->get();$this->assertCount(1,$bound);
        $this->assertSame($phone->data,$bound[0]->data);$this->assertSame(5,$p->contactFields()->whereHas('contactFieldType',fn($q)=>$q->whereIn('name',['WeChat','LinkedIn','Whatsapp']))->count());
        $again=$this->import($a,$this->source(),ImportVCard::BEHAVIOUR_REPLACE);$this->assertArrayNotHasKey('error',$again);$this->assertSame($p->id,$again['contact_id']);$this->assertSame(5,$p->occupations()->count());$this->assertSame(2,$p->notes()->count());
    }
    public function test_add_skip_precedes_metadata_validation_and_mutations()
    {
        Queue::fake();$a=$this->account();$first=$this->import($a,$this->source());$before=Occupation::count();
        $bad=str_replace('unspecified','invalid',$this->source());$result=$this->import($a,$bad);
        $this->assertSame('ERROR_CONTACT_EXIST',$result['error']);$this->assertSame($before,Occupation::count());
    }
    public function test_printed_escaped_values_and_optional_language_metadata_survive_normalization()
    {
        $source="BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Fictional\r\njob1.ORG;X-C2V-PAIR=v1;LANGUAGE=en:Comma\\, Semi\\; Slash\\\\\r\njob1.TITLE;X-C2V-PAIR=v1;LANGUAGE=en:Advisor\r\nEND:VCARD\r\n";
        $data=app(OrganizationCard::class)->normalize(Reader::read($source));
        $this->assertSame('Comma, Semi; Slash\\',$data['jobs'][0]['variants'][0]['company']);$this->assertSame('en',$data['jobs'][0]['variants'][0]['language']);$this->assertSame('unspecified',$data['jobs'][0]['status']);
    }
    public function test_title_only_occupation_api_resource_serializes_a_null_company()
    {
        $a=$this->account();$p=$this->contact($a);$job=app(Work::class)->save($p,[['title'=>'Advisor']]);
        $this->actingAs(factory(User::class)->create(['account_id'=>$a->id]));
        $resource=(new \App\Http\Resources\Occupation\Occupation($job))->response()->getData(true);
        $this->assertNull($resource['data']['company']);$this->assertSame('Advisor',$resource['data']['title']);
    }
    public function test_browser_downloads_and_extracted_zip_entries_import_in_both_modes()
    {
        Queue::fake();
        foreach (['monica','structured'] as $mode) foreach (['combined','zip-entry'] as $download) {
            $source=file_get_contents('/tmp/c2v-handoff/'.$mode.'-'.$download.'.vcf');
            $a=$this->account();$result=$this->import($a,$source);$this->assertArrayNotHasKey('error',$result);
            $p=Contact::findOrFail($result['contact_id']);$jobs=$p->occupations()->orderBy('position')->get();
            $this->assertSame($mode==='structured' ? 2 : 1,$jobs->count());
            $this->assertSame('示例',$p->company);$this->assertSame('顾问',$p->job);
            $this->assertSame('555-0111',$p->contactFields()->phone()->first()->data);
            if ($mode==='structured') {
                $this->assertSame(['current','former'],$jobs->pluck('status')->all());
                $this->assertCount(2,$jobs[0]->variants);
                $addresses=$p->addresses()->orderBy('id')->get();$this->assertCount(2,$addresses);
                $this->assertNotNull($addresses[0]->alternative_group);$this->assertSame($addresses[0]->alternative_group,$addresses[1]->alternative_group);
                $this->assertSame(1,$p->contactFields()->whereNotNull('phone_id')->count());
            }
            $this->assertSame('ERROR_CONTACT_EXIST',$this->import($a,$source)['error']);
            $again=$this->import($a,$source,ImportVCard::BEHAVIOUR_REPLACE);
            $this->assertSame($p->id,$again['contact_id']);$this->assertSame($jobs->count(),$p->occupations()->count());
        }
    }
    public function test_replace_absent_properties_keeps_legacy_collection_policies()
    {
        Queue::fake();$a=$this->account();$result=$this->import($a,$this->source());$p=Contact::findOrFail($result['contact_id']);
        $notes=$p->notes()->count();$fields=$p->contactFields()->count();$addresses=$p->addresses()->count();
        $minimal="BEGIN:VCARD\r\nVERSION:4.0\r\nUID:$p->uuid\r\nFN:Fictional Person\r\nN:;Fictional Person;;;\r\nEND:VCARD\r\n";
        $again=$this->import($a,$minimal,ImportVCard::BEHAVIOUR_REPLACE);$this->assertSame($p->id,$again['contact_id']);
        $this->assertSame($fields,$p->contactFields()->count());$this->assertSame($addresses,$p->addresses()->count());$this->assertSame($notes,$p->notes()->count());
        $this->assertSame(5,$p->occupations()->count());$this->assertSame('Example',$p->fresh()->company);
    }
    public function test_pairing_validation_rejects_incomplete_alternative_metadata()
    {
        foreach ([
            str_replace('TITLE;ALTID=job1-title;X-C2V-PAIR=v2','TITLE;X-C2V-PAIR=v2',$this->source()),
            str_replace('ORG;ALTID=job1-org;X-C2V-PAIR=v2','ORG;ALTID=other-org;X-C2V-PAIR=v2',$this->source()),
            str_replace('X-C2V-PAIR=v2','X-C2V-PAIR=v1',$this->source()),
        ] as $source) {
            try { app(OrganizationCard::class)->normalize(Reader::read($source));$this->fail('Expected metadata rejection'); }
            catch (ValidationException $e) { $this->assertArrayHasKey('vcard',$e->errors()); }
        }
    }
    public function test_matching_precedence_is_uid_then_email_then_name_with_account_scope()
    {
        $a=$this->account();$p=$this->contact($a);$q=$this->contact($a);
        $p->update(['first_name'=>'Fictional A','last_name'=>null]);$q->update(['first_name'=>'Fictional B','last_name'=>null]);
        $type=$a->contactFieldTypes()->where('type','email')->first();
        ContactField::create(['account_id'=>$a->id,'contact_id'=>$q->id,'contact_field_type_id'=>$type->id,'data'=>'fictional-b@example.invalid']);
        foreach ([['UID:'.$p->uuid.'\r\nEMAIL:fictional-b@example.invalid',$p->id],['EMAIL:fictional-b@example.invalid',$q->id],['',$q->id]] as [$identity,$expected]) {
            $identity=str_replace('\\r\\n',"\r\n",$identity);
            $source="BEGIN:VCARD\r\nVERSION:4.0\r\n$identity\r\nFN:Fictional B\r\nN:;Fictional B;;;\r\nEND:VCARD\r\n";
            $result=$this->import($a,$source);$this->assertArrayHasKey('error',$result,'Matching identity: '.$identity);$this->assertSame('ERROR_CONTACT_EXIST',$result['error']);$this->assertSame($expected,$result['contact_id']);
        }
        Queue::fake();$other=$this->account();$result=$this->import($other,$source);$this->assertArrayNotHasKey('error',$result);$this->assertSame($other->id,Contact::findOrFail($result['contact_id'])->account_id);
    }
    public function test_rating_order_and_former_membership_filters_use_stable_levels()
    {
        $a=$this->account();$p=$this->contact($a);$q=$this->contact($a);$unrated=$this->contact($a);
        $levels=DB::table('rating_levels')->where('account_id',$a->id)->where('dimension','closeness')->orderBy('position')->get();
        $batch=app(Batch::class);$batch->execute($a->id,['contact_ids'=>[$p->id],'closeness'=>$levels[2]->id]);$batch->execute($a->id,['contact_ids'=>[$q->id],'closeness'=>$levels[0]->id]);
        $query=app(PeopleQuery::class);$this->assertSame([$p->id,$q->id,$unrated->id],$query->sort(Contact::where('account_id',$a->id),'closeness')->pluck('id')->all());
        DB::table('rating_levels')->where('id',$levels[0]->id)->update(['name'=>'Renamed','position'=>10]);
        $this->assertSame([$q->id,$p->id,$unrated->id],$query->sort(Contact::where('account_id',$a->id),'closeness')->pluck('id')->all());
        $job=app(Work::class)->save($p,[['company'=>'Example','title'=>'Advisor','status'=>'unspecified']]);app(Work::class)->save($q,[['company'=>'Example','title'=>'Former','status'=>'former']]);
        $this->assertSame([$p->id],$query->apply(Contact::query(),$a->id,['company_id'=>$job->company_id])->pluck('id')->all());
        $this->assertSame([$p->id,$q->id],$query->apply(Contact::query(),$a->id,['company_id'=>$job->company_id,'include_former'=>true])->orderBy('id')->pluck('id')->all());
        $batch->execute($a->id,['contact_ids'=>[$p->id],'closeness'=>null]);$this->assertNull($p->fresh()->closeness_id);
    }
    public function test_ambiguous_legacy_company_choice_and_failed_work_edit_are_atomic()
    {
        Queue::fake();$a=$this->account();$p=$this->contact($a);app(Work::class)->save($p,[['company'=>'Original','title'=>'Advisor']]);
        factory(Company::class,2)->create(['account_id'=>$a->id,'name'=>'Ambiguous']);$user=factory(User::class)->create(['account_id'=>$a->id]);
        try {
            app(\App\Services\Contact\Contact\UpdateWorkInformation::class)->execute(['account_id'=>$a->id,'author_id'=>$user->id,'contact_id'=>$p->id,'company'=>'Ambiguous','job'=>'New']);
            $this->fail('Expected company review');
        } catch (ValidationException $e) { $this->assertSame('Original',$p->fresh()->company); }
        $source="BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Other Fictional Person\r\nN:;Other Fictional Person;;;\r\nORG:Ambiguous\r\nTITLE:Advisor\r\nEND:VCARD\r\n";
        $this->assertSame('ERROR_COMPANY_REVIEW',$this->import($a,$source)['error']);
        $result=app(ImportVCard::class)->execute(['account_id'=>$a->id,'user_id'=>$user->id,'entry'=>$source,'behaviour'=>ImportVCard::BEHAVIOUR_ADD,'company_choices'=>[0=>'new']]);
        $this->assertArrayNotHasKey('error',$result);$this->assertSame('Ambiguous',Contact::findOrFail($result['contact_id'])->company);
    }
    public function test_invalid_metadata_rolls_back_card_and_dangling_phone_is_rejected()
    {
        $a=$this->account();$before=Contact::count();
        foreach ([str_replace('X-C2V-PHONE=phone1','X-C2V-PHONE=missing',$this->source()),str_replace('unspecified','unknown',$this->source())] as $bad) {
            $result=$this->import($a,$bad);$this->assertSame('ERROR_ORGANIZATION_METADATA',$result['error']);$this->assertSame($before,Contact::count());
        }
        $this->assertSame(0,Company::where('account_id',$a->id)->count());
    }
    public function test_ambiguous_company_queues_owned_expiring_review_before_contact_changes()
    {
        $a=$this->account();factory(Company::class,2)->create(['account_id'=>$a->id,'name'=>'Example']);$before=Contact::count();
        $r=$this->import($a,$this->source());$this->assertSame('ERROR_COMPANY_REVIEW',$r['error']);$this->assertSame($before,Contact::count());
        $row=DB::table('organization_import_reviews')->where('id',$r['review_id'])->first();$this->assertSame($a->id,$row->account_id);$this->assertStringNotContainsString('Fictional Person',$row->payload);
        $user=User::where('account_id',$a->id)->first();$other=factory(User::class)->create();$this->actingAs($other)->withoutMiddleware()->get(route('organization.review',$row->id))->assertNotFound();
        $this->actingAs($user)->get(route('organization.review',$row->id))->assertOk()->assertSee('Resolve company matches');
        app()->setLocale('zh');
        $this->get(route('organization.review', $row->id))->assertOk()->assertSee('确认公司匹配');
        $this->assertSame('请为无法唯一匹配的工作经历选择公司。', (new ImportJobReport([
            'skip_reason' => 'Choose a company for each ambiguous job.',
        ]))->localizedSkipReason());
        $this->assertSame('请为无法唯一匹配的工作经历选择公司。', (new ImportJobReport([
            'skip_reason' => $r['reason'],
        ]))->localizedSkipReason());
        app()->setLocale('en');
        $this->post(route('organization.resolve-review',$row->id),['company_choices'=>[0=>'new',2=>'new']])->assertRedirect();$this->assertSame($before+1,Contact::count());
        $this->assertFalse(DB::table('organization_import_reviews')->where('id',$row->id)->exists());
    }
    public function test_exact_company_matching_preserves_case_and_shared_unlink_is_person_local()
    {
        $a=$this->account();$p=$this->contact($a);$q=$this->contact($a);$work=app(Work::class);
        $rows=[['company'=>'Example','title'=>'Advisor'],['company'=>'示例','title'=>'顾问']];
        $job=$work->save($p,$rows);$other=$work->save($q,$rows);$this->assertSame($job->company_id,$other->company_id);
        $work->unlink($p,$job->id);$this->assertSame(2,$p->occupations()->count());$this->assertSame(1,$q->occupations()->count());$this->assertCount(2,$other->fresh()->variants);
        $this->assertSame([$job->company_id],$work->candidates($a->id,['示例']));$this->assertSame([],$work->candidates($a->id,['example']));
        $this->assertSame(2,DB::table('company_aliases')->where('company_id',$job->company_id)->count());
    }
    public function test_backfill_is_idempotent_and_retains_conflicting_flat_and_occupation_data()
    {
        $a=$this->account();$p=$this->contact($a);$c=factory(Company::class)->create(['account_id'=>$a->id,'name'=>'Existing']);
        $job=Occupation::create(['account_id'=>$a->id,'contact_id'=>$p->id,'company_id'=>$c->id,'title'=>'Researcher','currently_works_here'=>false,'start_date'=>'2011-02-03','end_date'=>'2015-06-07']);
        $p->company='Legacy';$p->job='Director';$p->save();app(Backfill::class)->contact($p);app(Backfill::class)->contact($p->fresh());
        $this->assertSame(2,$p->occupations()->count());$this->assertSame('former',$job->fresh()->status);$this->assertSame('2011-02-03',$job->fresh()->start_date->toDateString());$this->assertSame('Legacy',$p->fresh()->company);
    }
    public function test_defaults_are_idempotent_and_level_renames_keep_ratings()
    {
        $a=$this->account();$level=DB::table('rating_levels')->where('account_id',$a->id)->first();DB::table('rating_levels')->where('id',$level->id)->update(['name'=>'Renamed']);
        app(Defaults::class)->execute($a->id);$this->assertSame(6,DB::table('rating_levels')->where('account_id',$a->id)->count());$this->assertSame('Renamed',DB::table('rating_levels')->where('id',$level->id)->value('name'));
    }
    public function test_phone_binding_follows_edits_and_converts_to_independent_on_delete()
    {
        $a=$this->account();$p=$this->contact($a);$types=$a->contactFieldTypes()->get();
        $phone=ContactField::create(['account_id'=>$a->id,'contact_id'=>$p->id,'contact_field_type_id'=>$types->firstWhere('type','phone')->id,'data'=>'555-0100']);
        $wa=ContactField::create(['account_id'=>$a->id,'contact_id'=>$p->id,'contact_field_type_id'=>$types->firstWhere('name','Whatsapp')->id,'data'=>'555-0100','phone_id'=>$phone->id]);
        $phone->update(['data'=>'555-0199']);$this->assertSame('555-0199',$wa->fresh()->data);$phone->delete();$this->assertNull($wa->fresh()->phone_id);$this->assertSame('555-0199',$wa->fresh()->data);
    }
    public function test_batch_is_atomic_and_tag_filters_are_or_within_and_across_categories()
    {
        $a=$this->account();$p=$this->contact($a);$q=$this->contact($a);$foreign=$this->contact($this->account());
        $cat1=DB::table('tag_categories')->insertGetId(['account_id'=>$a->id,'name'=>'Area']);$cat2=DB::table('tag_categories')->insertGetId(['account_id'=>$a->id,'name'=>'Role']);$tags=[];
        foreach (['Finance','Healthcare','Governance'] as $i=>$name) { $tag=Tag::create(['account_id'=>$a->id,'name'=>$name,'name_slug'=>strtolower($name)]);DB::table('tags')->where('id',$tag->id)->update(['category_id'=>$i===2 ? $cat2 : $cat1]);$tags[]=$tag->id; }
        app(Batch::class)->execute($a->id,['contact_ids'=>[$p->id],'add_tags'=>$tags]);app(Batch::class)->execute($a->id,['contact_ids'=>[$q->id],'add_tags'=>[$tags[0]]]);
        $filtered=app(PeopleQuery::class)->apply(Contact::query(),$a->id,['tag_ids'=>$tags])->pluck('id')->all();$this->assertSame([$p->id],$filtered);
        try { app(Batch::class)->execute($a->id,['contact_ids'=>[$p->id,$foreign->id],'remove_tags'=>$tags]);$this->fail('Expected account rejection'); } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(404,$e->getStatusCode()); }
        $this->assertSame(3,$p->tags()->count());
    }
    public function test_last_contacted_is_derived_from_events_and_changes_after_deletion()
    {
        $a=$this->account();$p=$this->contact($a);$call=factory(\App\Models\Contact\Call::class)->create(['account_id'=>$a->id,'contact_id'=>$p->id,'called_at'=>'2020-01-01']);
        $activity=factory(\App\Models\Account\Activity::class)->create(['account_id'=>$a->id,'happened_at'=>'2022-03-04']);$activity->contacts()->attach($p->id,['account_id'=>$a->id]);
        $this->assertSame('2022-03-04',$p->last_contacted->toDateString());$activity->contacts()->detach($p->id);$this->assertSame('2020-01-01',$p->last_contacted->toDateString());$call->delete();$this->assertNull($p->last_contacted);
        $conversation=factory(\App\Models\Contact\Conversation::class)->create(['account_id'=>$a->id,'contact_id'=>$p->id,'happened_at'=>'2023-05-06']);
        $activity->contacts()->attach($p->id,['account_id'=>$a->id]);$this->assertSame('2023-05-06',$p->last_contacted->toDateString());
        $conversation->update(['happened_at'=>'2021-01-01']);$this->assertSame('2022-03-04',$p->last_contacted->toDateString());
        $activity->delete();$this->assertSame('2021-01-01',$p->last_contacted->toDateString());$p->touch();$this->assertSame('2021-01-01',$p->last_contacted->toDateString());
        $conversation->delete();$this->assertNull($p->last_contacted);
    }
    public function test_phone_type_changes_and_cross_contact_references_preserve_independent_values()
    {
        $a=$this->account();$p=$this->contact($a);$q=$this->contact($a);$types=$a->contactFieldTypes()->get();
        $phone=ContactField::create(['account_id'=>$a->id,'contact_id'=>$p->id,'contact_field_type_id'=>$types->firstWhere('type','phone')->id,'data'=>'555-0100']);
        $wa=ContactField::create(['account_id'=>$a->id,'contact_id'=>$p->id,'contact_field_type_id'=>$types->firstWhere('name','Whatsapp')->id,'data'=>'555-0100','phone_id'=>$phone->id]);
        try { ContactField::create(['account_id'=>$a->id,'contact_id'=>$q->id,'contact_field_type_id'=>$wa->contact_field_type_id,'data'=>'555-0100','phone_id'=>$phone->id]);$this->fail('Expected contact scope rejection'); }
        catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) { $this->assertSame(2,$p->contactFields()->count()); }
        $phone->update(['contact_field_type_id'=>$types->firstWhere('type','email')->id,'data'=>'fictional@example.invalid']);
        $this->assertNull($wa->fresh()->phone_id);$this->assertSame('555-0100',$wa->fresh()->data);
    }
    public function test_backfill_handles_empty_partial_and_already_matching_legacy_shapes()
    {
        $a=$this->account();$empty=$this->contact($a);$partial=$this->contact($a);$partial->job='Title only';$partial->save();
        $matched=$this->contact($a);$company=factory(Company::class)->create(['account_id'=>$a->id,'name'=>'Example']);
        $job=Occupation::create(['account_id'=>$a->id,'contact_id'=>$matched->id,'company_id'=>$company->id,'title'=>'Advisor','currently_works_here'=>true,'start_date'=>'2010-01-01']);
        $matched->company='Example';$matched->job='Advisor';$matched->save();$backfill=app(Backfill::class);
        foreach ([$empty,$partial,$matched] as $person) { $backfill->contact($person);$backfill->contact($person->fresh()); }
        $this->assertSame(0,$empty->occupations()->count());$this->assertNull($empty->fresh()->primary_occupation_id);
        $this->assertSame(1,$partial->occupations()->count());$this->assertNull($partial->occupations()->first()->company_id);$this->assertSame('unspecified',$partial->occupations()->first()->status);
        $this->assertSame(1,$matched->occupations()->count());$this->assertSame($job->id,$matched->fresh()->primary_occupation_id);$this->assertSame('current',$job->fresh()->status);$this->assertSame('2010-01-01',$job->fresh()->start_date->toDateString());
    }
    public function test_company_deletion_repairs_primary_projection_without_changing_other_jobs()
    {
        $a=$this->account();$p=$this->contact($a);$work=app(Work::class);$first=$work->save($p,[['company'=>'First','title'=>'Advisor']]);$second=$work->save($p,[['company'=>'Second','title'=>'Reviewer']]);
        app(\App\Services\Account\Company\DestroyCompany::class)->execute(['account_id'=>$a->id,'company_id'=>$first->company_id]);
        $this->assertSame($second->id,$p->fresh()->primary_occupation_id);$this->assertSame('Second',$p->fresh()->company);$this->assertSame(1,$p->occupations()->count());
    }
    public function test_existing_pages_render_new_controls_and_filtered_empty_state()
    {
    public function test_bulk_delete_confirms_and_checks_the_whole_selection(): void
    {
        $account = $this->account();
        $user = factory(User::class)->create(['account_id' => $account->id]);
        app(\App\Services\User\AcceptPolicy::class)->execute([
            'account_id' => $account->id,
            'user_id' => $user->id,
            'ip_address' => null,
        ]);
        $first = $this->contact($account);
        $second = $this->contact($account);
        $unselected = $this->contact($account);
        $foreign = $this->contact($this->account());
        $archived = $this->contact($account);
        $archived->forceFill(['is_active' => false])->save();
        $selection = ['contact_ids' => [$first->id, $second->id]];

        $this->actingAs($user)
            ->post(route('organization.delete.confirm'), $selection)
            ->assertOk()->assertSee('Delete 2 contacts?')->assertSee($first->name)->assertSee($second->name);
        $this->assertNotNull($first->fresh());
        $this->delete(route('organization.delete'), $selection)->assertSessionHasErrors('confirmed');
        $this->delete(route('organization.delete'), ['contact_ids' => [$first->id, $foreign->id], 'confirmed' => 1])
            ->assertNotFound();
        $this->delete(route('organization.delete'), ['contact_ids' => [$first->id, $archived->id], 'confirmed' => 1])
            ->assertSessionHasErrors();
        $this->assertNotNull($first->fresh());
        $this->assertNotNull($second->fresh());

        $this->delete(route('organization.delete', ['search' => 'fictional', 'page' => 2]), $selection + ['confirmed' => 1])
            ->assertRedirect(route('people.index', ['search' => 'fictional']))
            ->assertSessionHas('success', '2 contacts deleted.');
        $this->assertSoftDeleted($first);
        $this->assertSoftDeleted($second);
        $this->assertNotNull($unselected->fresh());
        $this->assertNotNull($foreign->fresh());
        $this->assertNotNull($archived->fresh());
    }

        Queue::fake();$a=$this->account();$user=factory(User::class)->create(['account_id'=>$a->id]);$p=$this->contact($a);$this->actingAs($user)->withoutMiddleware([
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \App\Http\Middleware\CheckCompliance::class,
            \App\Http\Middleware\CheckVersion::class,
            \PragmaRX\Google2FALaravel\Middleware::class,
            \LaravelWebauthn\Http\Middleware\WebauthnMiddleware::class,
            \Laravel\Passport\Http\Middleware\CreateFreshApiToken::class,
        ]);
        $this->get(route('people.work.edit',$p))->assertOk()->assertSee('Jobs and printed language variants');
        $this->get(route('people.index',['search'=>'no-fictional-match']))->assertOk()->assertSee('No people match these filters.');
        $this->get(route('organization.settings'))->assertOk()->assertSee('Categories and rating levels');

        $user->update(['locale' => 'zh']);
        $this->get(route('people.index'))->assertOk()
            ->assertSee('包含曾任职人员')
            ->assertSee('添加标签')
            ->assertSee('移除标签')
            ->assertSee('删除选中的联系人')
            ->assertDontSee('Include former memberships');
        $this->get(route('people.work.edit', $p))->assertOk()->assertSee('保存工作经历');
        $this->get(route('people.show', $p))->assertOk()->assertSee('联系方式和语言版本关联');
        $this->get(route('organization.settings'))->assertOk()->assertSee('标签分类和评级');
        $this->get(route('settings.upload'))->assertOk()->assertSee('Monica 支持 vCard 3.0 和 4.0。')
            ->assertSee('添加新联系人并跳过已有联系人');
        $this->post(route('organization.delete.confirm'), ['contact_ids' => [$p->id]])
            ->assertOk()->assertSee('删除 1 位联系人？')->assertSee($p->name);
        $this->delete(route('organization.delete'), ['contact_ids' => [$p->id], 'confirmed' => '1'])
            ->assertRedirect()->assertSessionHas('success', '已删除 1 位联系人。');
    }
    public function test_filtered_pagination_preserves_query_and_last_contacted_in_html_and_json()
    {
        Queue::fake();$a=$this->account();$user=factory(User::class)->create(['account_id'=>$a->id]);$this->actingAs($user)->withoutMiddleware();
        for ($i=0;$i<12;$i++) {
            $p=$this->contact($a);$job=app(Work::class)->save($p,[['company'=>'Pagination Example','title'=>'Advisor']]);
            if ($i===0) { $first=$p;factory(\App\Models\Contact\Call::class)->create(['account_id'=>$a->id,'contact_id'=>$p->id,'called_at'=>'2024-01-02']); }
        }
        $filters=['company_id'=>$job->company_id,'sort'=>'last_contacted','perPage'=>10,'search'=>''];
        $response=$this->get(route('people.index',$filters))->assertOk()->assertSee('2024-01-02');
        $page=$response->viewData('organizationContacts');$this->assertSame(12,$page->total());$this->assertSame(10,$page->count());$this->assertSame($first->id,$page->first()->id);$this->assertStringContainsString('company_id='.$job->company_id,$page->nextPageUrl());$this->assertStringContainsString('sort=last_contacted',$page->nextPageUrl());
        $second=$this->get(route('people.index',$filters+['page'=>2]))->assertOk()->viewData('organizationContacts');$this->assertSame(2,$second->count());$this->assertNotContains($first->id,$second->pluck('id')->all());
        $json=$this->get(route('people.list',$filters))->assertOk()->assertJsonPath('totalRecords',12)->json();
        $this->assertStringStartsWith('2024-01-02',$json['contacts'][0]['last_contacted']);
    }
}
