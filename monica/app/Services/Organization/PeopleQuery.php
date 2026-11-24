<?php
namespace App\Services\Organization;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PeopleQuery
{
    public static function lastContactedSql(): string
    {
        return "NULLIF(GREATEST(COALESCE((SELECT MAX(called_at) FROM calls WHERE calls.contact_id=contacts.id AND calls.account_id=contacts.account_id),'1000-01-01'),COALESCE((SELECT MAX(happened_at) FROM conversations WHERE conversations.contact_id=contacts.id AND conversations.account_id=contacts.account_id),'1000-01-01'),COALESCE((SELECT MAX(activities.happened_at) FROM activities INNER JOIN activity_contact ON activity_contact.activity_id=activities.id WHERE activity_contact.contact_id=contacts.id AND activity_contact.account_id=contacts.account_id AND activities.account_id=contacts.account_id),'1000-01-01')),'1000-01-01')";
    }
    public function withLastContacted($query)
    {
        return $query->selectRaw(self::lastContactedSql().' AS organization_last_contacted');
    }
    public function apply($query,int $account,array $filters)
    {
        validator($filters,[
            'company_id'=>'nullable|integer','include_former'=>'nullable|boolean',
            'tag_ids'=>'sometimes|array','tag_ids.*'=>'integer|distinct',
            'tags'=>'sometimes|array','tags.*'=>'string',
            'closeness'=>'nullable|string','importance'=>'nullable|string',
        ])->validate();
        $query->where('contacts.account_id',$account);
        if (! empty($filters['company_id'])) {
            $query->whereHas('occupations',function ($q) use ($filters,$account) {
                $q->where('account_id',$account)->where('company_id',$filters['company_id']);
                if (empty($filters['include_former'])) $q->where('status','!=','former');
            });
        }
        $ids=$filters['tag_ids'] ?? DB::table('tags')->where('account_id',$account)->whereIn('name',$filters['tags'] ?? [])->pluck('id')->all();
        $tags=DB::table('tags')->where('account_id',$account)->whereIn('id',$ids)->get();
        if ($tags->count()!==count(array_unique($ids))) throw ValidationException::withMessages(['tags'=>trans('organization.people.invalid_tags')]);
        foreach ($tags->groupBy(fn ($t)=>$t->category_id ?? 'uncategorized') as $group) {
            $query->whereHas('tags',fn ($q)=>$q->whereIn('tags.id',$group->pluck('id'))->where('tags.account_id',$account));
        }
        foreach (['closeness','importance'] as $dimension) if (isset($filters[$dimension]) && $filters[$dimension]!=='') {
            if ($filters[$dimension]==='unrated') $query->whereNull($dimension.'_id');
            else {
                if (! DB::table('rating_levels')->where('account_id',$account)->where('dimension',$dimension)->where('id',$filters[$dimension])->exists()) throw ValidationException::withMessages([$dimension=>trans('organization.people.invalid_level')]);
                $query->where($dimension.'_id',$filters[$dimension]);
            }
        }
        return $query;
    }
    public function sort($query,string $sort)
    {
        if (in_array($sort,['closeness','importance'],true)) {
            $column=$sort.'_id';
            $query->reorder()->orderByRaw("contacts.$column IS NULL")->orderBy(DB::table('rating_levels')->select('position')->whereColumn('rating_levels.id','contacts.'.$column),'desc')->orderBy('contacts.id');
        } elseif ($sort==='last_contacted') $query->reorder()->orderByRaw(self::lastContactedSql().' IS NULL')->orderByRaw(self::lastContactedSql().' DESC')->orderBy('contacts.id');
        return $query;
    }
}
