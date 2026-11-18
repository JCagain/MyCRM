<?php
namespace App\Services\Organization;
use App\Models\Contact\Contact;
use App\Models\Contact\Occupation;
use Illuminate\Support\Facades\DB;

class Backfill
{
    public function execute(): void
    {
        foreach (DB::table('accounts')->orderBy('id')->pluck('id') as $account) {
            DB::transaction(function () use ($account) {
                DB::table('accounts')->where('id',$account)->lockForUpdate()->first();
                app(Defaults::class)->execute($account);
                Contact::where('account_id',$account)->orderBy('id')->chunkById(100,function ($contacts) {
                    foreach ($contacts as $contact) $this->contact($contact);
                });
            });
        }
    }

    public function contact(Contact $contact): void
    {
        $work = app(Work::class);
        $jobs = Occupation::where('contact_id',$contact->id)->where('account_id',$contact->account_id)->orderBy('id')->get();
        foreach ($jobs as $position=>$job) {
            if (! $job->variants()->exists()) {
                $job->variants()->create(['company'=>$job->company->name ?? null,'title'=>$job->title,'position'=>0]);
                $job->position=$position;$job->save();
            }
            if ($job->company) $work->alias($contact->account_id,$job->company->id,$job->company->name);
        }
        if ($contact->primary_occupation_id) return;
        $primary=null;
        if ($contact->company || $contact->job) {
            $matches=$jobs->filter(fn ($j)=>($j->company->name ?? '')===($contact->company ?? '') && ($j->title ?? '')===($contact->job ?? ''));
            if ($matches->count()===1) $primary=$matches->first();
            else {
                $key='flat:'.$contact->id;
                $primary=Occupation::where('legacy_key',$key)->first();
                if (! $primary) {
                    $names = $contact->company ? [$contact->company] : [];
                    $candidates = $work->candidates($contact->account_id, $names);
                    // Keep ambiguous printed names on the variant for later resolution.
                    $company = count($candidates) > 1 ? null : $work->resolve($contact->account_id, $names);
                    $primary=Occupation::create(['account_id'=>$contact->account_id,'contact_id'=>$contact->id,'company_id'=>$company,'title'=>$contact->job,'status'=>'unspecified','currently_works_here'=>true,'legacy_key'=>$key,'position'=>0]);
                    $primary->variants()->create(['company'=>$contact->company,'title'=>$contact->job,'position'=>0]);
                }
            }
        } else $primary=$jobs->first();
        if ($primary) $work->project($contact,$primary,$primary->variants()->orderBy('position')->orderBy('id')->first());
    }
}
