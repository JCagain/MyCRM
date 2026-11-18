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
        $work=app(Work::class);$existing=Occupation::where('account_id',$contact->account_id)->where('contact_id',$contact->id)->orderBy('position')->orderBy('id')->get();
        foreach ($data['jobs'] as $i=>$job) {
            $old=$existing->shift();$saved=$work->save($contact,$job['variants'],$old->id ?? null,$choices[$i] ?? null);
            $saved->position=$i;$saved->save();
            if ($i===0) $work->project($contact,$saved,$saved->variants()->first());
        }
        foreach ($existing as $job) $work->remove($contact,$job);
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
            ContactField::firstOrCreate(['account_id'=>$contact->account_id,'contact_id'=>$contact->id,'contact_field_type_id'=>$type->id,'phone_id'=>$phone,'data'=>$phone ? $phones->firstWhere('id',$phone)->data : $method['value']]);
        }
        $addresses=$contact->addresses()->orderBy('id')->get()->values();$groups=[];
        foreach ($data['addresses'] as $i=>$address) if (isset($addresses[$i])) {
            $token=$address['alternative_group'];
            if ($token) $groups[$token] ??= (string)Str::uuid();
            $addresses[$i]->update(['alternative_group'=>$token ? $groups[$token] : null,'language'=>$address['language'],'po_box'=>$address['parts'][0] ?? null,'extended'=>$address['parts'][1] ?? null,'printed_country'=>$address['parts'][6] ?? null]);
        }
    }
}
