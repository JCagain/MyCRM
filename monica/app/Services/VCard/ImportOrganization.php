<?php
namespace App\Services\VCard;

use App\Models\Contact\Contact;
use App\Models\Contact\ContactField;
use App\Models\Contact\ContactFieldType;
use App\Models\Contact\Occupation;
use App\Services\Organization\Defaults;
use App\Services\Organization\Work;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ImportOrganization
{
    public function preflight(int $account,array $data,array $choices=[]): array
    {
        $review=[];
        foreach ($data['jobs'] as $i=>$job) {
            $ids=app(Work::class)->candidates($account,array_column($job['variants'],'company'));
            if (count($ids)>1 && ! isset($choices[$i])) $review[$i]=DB::table('companies')->where('account_id',$account)->whereIn('id',$ids)->get(['id','name'])->all();
            if (isset($choices[$i]) && $choices[$i]!=='new') \App\Models\Account\Company::where('account_id',$account)->findOrFail($choices[$i]);
        }
        return $review;
    }
    public function jobs(Contact $contact,array $data,array $choices=[]): void
    {
        if (! $data['structured']) return;
        $work=app(Work::class);$existing=Occupation::where('account_id',$contact->account_id)->where('contact_id',$contact->id)->with('variants')->get()->keyBy('id');
        $matches = $this->matchJobs($data['jobs'], $existing);
        $primary = null;
        foreach ($data['jobs'] as $i=>$job) {
            $id = $matches[$i] ?? null;
            $saved=$work->save($contact,$job['variants'],$id,$choices[$i] ?? null);
            $existing->forget($id);
            $saved->position=$i;$saved->save();
            if ($i===0) $primary = $saved;
        }
        if ($primary) $work->project($contact,$primary,$primary->variants()->first());
        foreach ($existing as $job) $work->remove($contact,$job);
    }

    private function printedPairs(iterable $variants): array
    {
        $pairs = [];
        foreach ($variants as $variant) {
            $pairs[] = serialize([Work::key($variant['company'] ?? ''), Work::key($variant['title'] ?? '')]);
        }
        $pairs = array_values(array_unique($pairs));
        sort($pairs, SORT_STRING);

        return $pairs;
    }

    private function matchJobs(array $jobs, $existing): array
    {
        $incoming = array_map(fn ($job) => $this->printedPairs($job['variants']), $jobs);
        $stored = $existing->map(fn ($job) => $this->printedPairs($job->variants))->all();
        $matches = [];
        foreach ([
            fn ($a, $b) => $a === $b,
            fn ($a, $b) => (bool) array_intersect($a, $b),
        ] as $matchesPairs) {
            $candidates = [];
            foreach ($incoming as $index => $pairs) {
                $ids = array_keys(array_filter($stored, fn ($old) => $matchesPairs($pairs, $old)));
                if ($ids) $candidates[$index] = $ids;
            }
            $claimed = [];
            foreach ($candidates as $index => $ids) {
                if (count($ids) !== 1 || isset($claimed[$ids[0]])) {
                    throw ValidationException::withMessages(['job_identity' => 'import_vcard_job_identity']);
                }
                $id = $ids[0];
                $claimed[$id] = true;
                $matches[$index] = $id;
                unset($incoming[$index], $stored[$id]);
            }
        }

        return $matches;
    }
    public function fields(Contact $contact,array $data): void
    {
        app(Defaults::class)->execute($contact->account_id);
        $phones=$contact->contactFields()->phone()->orderBy('id')->get()->values();$refs=[];
        foreach ($data['phones'] as $i=>$phone) if ($phone['group'] && isset($phones[$i])) $refs[$phone['group']]=$phones[$i]->id;
        foreach ($data['methods'] as $method) {
            if ($method['value']==='') continue;
            $type=ContactFieldType::where('account_id',$contact->account_id)->get()->first(fn ($t)=>strtolower($t->type ?? '')===$method['service'] || strtolower($t->name)===$method['service']);
            if (! $type) throw ValidationException::withMessages(['contact_type'=>'Provision the missing contact field type.']);
            $phone=$method['phone'] ? ($refs[$method['phone']] ?? null) : null;
            if ($method['phone'] && ! $phone) throw ValidationException::withMessages(['phone'=>'Referenced phone could not be imported.']);
            // Preserve independent and explicitly bound equal numbers as different identities.
            $identity = ['account_id'=>$contact->account_id,'contact_id'=>$contact->id,'contact_field_type_id'=>$type->id,'phone_id'=>$phone];
            $value = $phone ? $phones->firstWhere('id',$phone)->data : $method['value'];
            $exists = ContactField::where($identity)->where('data', $value)->get()->contains(fn ($field) => $field->data === $value);
            if (! $exists) ContactField::create($identity + ['data' => $value]);
        }
        $addresses=$contact->addresses()->orderBy('id')->get()->values();$groups=[];
        foreach ($data['addresses'] as $i=>$address) if (isset($addresses[$i])) {
            $token=$address['alternative_group'];
            if ($token) $groups[$token] ??= (string)Str::uuid();
            $addresses[$i]->update(['alternative_group'=>$token ? $groups[$token] : null,'language'=>$address['language'],'po_box'=>$address['parts'][0] ?? null,'extended'=>$address['parts'][1] ?? null,'printed_country'=>$address['parts'][6] ?? null]);
        }
    }
}
