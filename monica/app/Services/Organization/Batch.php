<?php
namespace App\Services\Organization;
use App\Models\Contact\Contact;
use App\Models\Contact\Tag;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class Batch
{
    public function execute(int $account,array $input): void
    {
        validator($input,['contact_ids'=>'required|array|min:1|max:500','contact_ids.*'=>'required|integer|distinct','add_tags'=>'sometimes|array','remove_tags'=>'sometimes|array','add_tags.*'=>'integer|distinct','remove_tags.*'=>'integer|distinct','closeness'=>'sometimes|nullable|integer','importance'=>'sometimes|nullable|integer'])->validate();
        DB::transaction(function () use ($account,$input) {
            $contacts=Contact::where('account_id',$account)->whereIn('id',$input['contact_ids'])->lockForUpdate()->get();
            if ($contacts->count()!==count($input['contact_ids'])) abort(404);
            foreach ($contacts as $contact) $contact->throwInactive();
            foreach (['add_tags','remove_tags'] as $key) if (Tag::where('account_id',$account)->whereIn('id',$input[$key] ?? [])->count()!==count($input[$key] ?? [])) abort(422);
            foreach (['closeness','importance'] as $dimension) if (isset($input[$dimension]) && ! DB::table('rating_levels')->where('account_id',$account)->where('dimension',$dimension)->where('id',$input[$dimension])->exists()) abort(422);
            foreach ($contacts as $contact) {
                foreach ($input['add_tags'] ?? [] as $tag) $contact->tags()->syncWithoutDetaching([$tag=>['account_id'=>$account]]);
                $contact->tags()->detach($input['remove_tags'] ?? []);
                foreach (['closeness','importance'] as $dimension) if (array_key_exists($dimension,$input)) $contact->{$dimension.'_id'}=$input[$dimension];
                $contact->save();
            }
        });
    }
}
