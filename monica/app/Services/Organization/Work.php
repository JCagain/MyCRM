<?php
namespace App\Services\Organization;

use App\Models\Account\Company;
use App\Models\Contact\Contact;
use App\Models\Contact\Occupation;
use App\Models\Contact\JobVariant;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class Work
{
    public static function key(string $name): string { return \Normalizer::normalize($name,\Normalizer::FORM_C); }
    public function alias(int $account,int $company,string $name): void
    {
        $name=self::key($name);
        DB::table('company_aliases')->updateOrInsert(['company_id'=>$company,'name_hash'=>hash('sha256',$name)],['account_id'=>$account,'name'=>$name]);
    }
    public function candidates(int $account,array $names): array
    {
        $names=array_unique(array_map([self::class,'key'],array_filter($names,fn ($n)=>$n!=='' && $n!==null)));
        $ids=[];
        // PHP equality avoids the database's case/accent-insensitive collation.
        foreach (Company::where('account_id',$account)->get(['id','name']) as $company) if (in_array(self::key($company->name),$names,true)) $ids[]=$company->id;
        foreach (DB::table('company_aliases')->where('account_id',$account)->whereIn('name_hash',array_map(fn ($n)=>hash('sha256',$n),$names))->get() as $alias) if (in_array($alias->name,$names,true)) $ids[]=$alias->company_id;
        return array_values(array_unique($ids));
    }
    public function resolve(int $account,array $names,$choice=null): ?int
    {
        $names=array_values(array_filter($names,fn ($n)=>$n!==null && $n!==''));
        if (! $names) return null;
        $ids=$this->candidates($account,$names);
        if ($choice!==null && $choice!=='new') {
            $id=Company::where('account_id',$account)->findOrFail($choice)->id;
        } elseif ($choice==='new' || ! $ids) {
            $id=Company::create(['account_id'=>$account,'name'=>$names[0]])->id;
        } elseif (count($ids)===1) $id=$ids[0];
        else throw ValidationException::withMessages(['company'=>trans('organization.work.choose_company')]);
        foreach ($names as $name) $this->alias($account,$id,$name);
        return $id;
    }
    public function save(Contact $contact,array $rows,?int $id=null,$choice=null): Occupation
    {
        return DB::transaction(function () use ($contact,$rows,$id,$choice) {
            $contact->throwInactive();
            $rows=array_values($rows);
            DB::table('accounts')->where('id',$contact->account_id)->lockForUpdate()->first();
            validator(['rows'=>$rows],['rows'=>'required|array|min:1|max:100','rows.*.company'=>'nullable|string|max:255','rows.*.title'=>'nullable|string|max:255','rows.*.language'=>'nullable|string|max:64','rows.*.status'=>'nullable|in:current,former,unspecified'])->validate();
            $statuses=array_unique(array_map(fn ($r)=>$r['status'] ?? 'unspecified',$rows));
            if (count($statuses)!==1 || collect($rows)->contains(fn ($r)=>empty($r['company']) && empty($r['title']))) throw ValidationException::withMessages(['jobs'=>trans('organization.work.align_status')]);
            $job=$id ? Occupation::where('account_id',$contact->account_id)->where('contact_id',$contact->id)->findOrFail($id) : new Occupation;
            $job->account_id=$contact->account_id;$job->contact_id=$contact->id;
            $job->company_id=$this->resolve($contact->account_id,array_column($rows,'company'),$choice);
            $job->title=$rows[0]['title'] ?? null;$job->status=$statuses[0];$job->currently_works_here=$job->status!=='former';
            if (! $job->exists) $job->position=Occupation::where('contact_id',$contact->id)->max('position')+1;
            $job->save();$job->variants()->delete();
            foreach ($rows as $position=>$row) $job->variants()->create(['company'=>$row['company'] ?? null,'title'=>$row['title'] ?? null,'language'=>$row['language'] ?? null,'position'=>$position]);
            if (! $contact->primary_occupation_id || $contact->primary_occupation_id===$job->id) $this->project($contact,$job,$job->variants()->orderBy('position')->first());
            return $job;
        });
    }
    public function project(Contact $contact,?Occupation $job,?JobVariant $variant): void
    {
        if ($job && ($job->account_id!==$contact->account_id || $job->contact_id!==$contact->id || ! $variant || $variant->occupation_id!==$job->id)) abort(422);
        if ($job) {
            $position=1;
            foreach ($job->variants()->where('id','!=',$variant->id)->get() as $other) { $other->position=$position++;$other->save(); }
            $variant->position=0;$variant->save();$job->title=$variant->title;$job->save();
        }
        $contact->primary_occupation_id=$job->id ?? null;$contact->primary_variant_id=$variant->id ?? null;
        $contact->company=$variant->company ?? null;$contact->job=$variant->title ?? null;$contact->save();
    }
    public function unlink(Contact $contact,int $id): void
    {
        DB::transaction(function () use ($contact,$id) {
            $job=Occupation::where('account_id',$contact->account_id)->where('contact_id',$contact->id)->findOrFail($id);
            $variants=$job->variants()->orderBy('position')->get();
            foreach ($variants as $i=>$variant) {
                if ($i===0) $target=$job;
                else { $target=$job->replicate(['legacy_key']);$target->position=$job->position+$i;$target->title=$variant->title;$target->save();$variant->occupation_id=$target->id;$variant->position=0;$variant->save(); }
                if ($contact->primary_variant_id===$variant->id) $this->project($contact,$target,$variant);
            }
        });
    }
    public function link(Contact $contact,array $ids,$choice=null): void
    {
        DB::transaction(function () use ($contact,$ids,$choice) {
            $jobs=Occupation::where('account_id',$contact->account_id)->where('contact_id',$contact->id)->whereIn('id',$ids)->orderBy('position')->orderBy('id')->get();
            if ($jobs->count()<2 || $jobs->count()!==count(array_unique($ids))) abort(422);
            foreach (['status','start_date','end_date','description','salary','salary_unit'] as $field) if ($jobs->pluck($field)->map(fn ($v)=>(string)$v)->unique()->count()>1) throw ValidationException::withMessages(['jobs'=>trans('organization.work.reconcile_before_linking')]);
            if ($jobs->pluck('company_id')->filter()->unique()->count()>1 && $choice===null) throw ValidationException::withMessages(['company'=>trans('organization.work.choose_for_linking')]);
            $target=$jobs->firstWhere('id',$contact->primary_occupation_id) ?? $jobs->first();$rows=[];
            foreach (collect([$target])->merge($jobs->where('id','!=',$target->id)) as $job) foreach ($job->variants as $variant) $rows[]=['company'=>$variant->company,'title'=>$variant->title,'language'=>$variant->language,'status'=>$job->status];
            $target=$this->save($contact,$rows,$target->id,$choice ?? $target->company_id);
            foreach ($jobs as $job) if ($job->id!==$target->id) $job->delete();
        });
    }
    public function remove(Contact $contact,Occupation $job): void
    {
        DB::transaction(function () use ($contact,$job) {
            if ($job->contact_id!==$contact->id || $job->account_id!==$contact->account_id) abort(404);
            $job->delete();
            if ($contact->primary_occupation_id===$job->id) { $next=Occupation::where('contact_id',$contact->id)->orderBy('position')->orderBy('id')->first();$this->project($contact,$next,$next ? $next->variants()->orderBy('position')->first() : null); }
        });
    }
}
