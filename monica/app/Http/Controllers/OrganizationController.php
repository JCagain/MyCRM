<?php
namespace App\Http\Controllers;

use App\Models\Contact\Contact;
use App\Models\Contact\ContactField;
use App\Models\Contact\JobVariant;
use App\Models\Contact\Occupation;
use App\Services\Organization\Batch;
use App\Services\Organization\Defaults;
use App\Services\Organization\Work;
use App\Services\VCard\ImportVCard;
use App\Services\VCard\ImportOrganization;
use App\Services\VCard\OrganizationCard;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class OrganizationController extends Controller
{
    private function owned(Contact $contact): void { abort_unless($contact->account_id===auth()->user()->account_id,404);$contact->throwInactive(); }
    public function work(Request $request,Contact $contact)
    {
        $this->owned($contact);$work=app(Work::class);
        $request->validate([
            'job_action'=>['nullable','string','regex:/^(save|link|unlink:[0-9]+|delete:[0-9]+|primary:[0-9]+)$/'],
            'job_ids'=>'sometimes|array|max:100','job_ids.*'=>'integer|distinct',
            'jobs'=>'sometimes|array|max:100','jobs.*'=>'array','jobs.*.variants'=>'required|array|max:100','jobs.*.variants.*'=>'array',
            'jobs.*.status'=>'nullable|in:unspecified,current,former',
            'company_choice'=>['nullable','regex:/^(new|[0-9]+)$/'],'jobs.*.company_choice'=>['nullable','regex:/^(new|[0-9]+)$/'],
        ]);
        DB::transaction(function () use ($request,$contact,$work) {
            $action=$request->input('job_action','save');$choice=$request->input('company_choice') ?: null;
            if ($action==='link') $work->link($contact,$request->input('job_ids',[]),$choice);
            elseif (Str::startsWith($action,'unlink:')) $work->unlink($contact,(int)substr($action,7));
            elseif (Str::startsWith($action,'delete:')) $work->remove($contact,Occupation::where('contact_id',$contact->id)->findOrFail(substr($action,7)));
            elseif (Str::startsWith($action,'primary:')) { $v=JobVariant::findOrFail(substr($action,8));$work->project($contact,$v->occupation,$v); }
            else {
                foreach ($request->input('jobs',[]) as $id=>$input) {
                    $rows=$input['variants'] ?? [];$rows=array_values(array_filter($rows,fn ($r)=>!empty($r['company']) || !empty($r['title'])));
                    if (! $rows) continue;
                    foreach ($rows as &$row) $row['status']=$input['status'] ?? 'unspecified';unset($row);
                    $work->save($contact,$rows,$id==='new' ? null : (int)$id,$input['company_choice'] ?? null);
                }
            }
        });
        return back()->with('success', trans('organization.work.updated'));
    }
    public function batch(Request $request)
    {
        $input=$request->all();foreach (['closeness','importance'] as $d) if (($input[$d] ?? '')==='keep') unset($input[$d]);
        app(Batch::class)->execute(auth()->user()->account_id,$input);return back()->with('success', trans('organization.people.batch_updated'));
    }
    public function confirmDelete(Request $request, Batch $batch)
    {
        $contacts = $batch->contactsToDelete($request->user()->account_id, $request->post());

        return view('people.organization-delete', [
            'contacts' => $contacts,
            'filters' => $request->query(),
        ]);
    }

    public function deleteSelected(Request $request, Batch $batch)
    {
        $input = $request->post();
        $people = redirect()->route('people.index', Arr::except($request->query(), 'page'));
        try {
            validator($input, ['confirmed' => 'required|accepted'])->validate();
            $count = $batch->delete($request->user()->account_id, $input);
        } catch (ValidationException $exception) {
            return $people->withErrors($exception->errors());
        }

        return $people->with('success', trans_choice('people.people_bulk_delete_success', $count));
    }

    public function settings()
    {
        $account=auth()->user()->account_id;app(Defaults::class)->execute($account);
        return view('settings.organization',compact('account'));
    }
    public function saveSettings(Request $request)
    {
        $account=auth()->user()->account_id;
        $request->validate(['kind'=>'required|in:category,tag,level','name'=>'required|string|max:255','id'=>'nullable|integer','category_id'=>'nullable|integer','dimension'=>'nullable|in:closeness,importance','position'=>'nullable|integer|min:0|max:10000']);
        DB::transaction(function () use ($request,$account) {
            $kind=$request->input('kind');$table=['category'=>'tag_categories','tag'=>'tags','level'=>'rating_levels'][$kind];
            $values=['name'=>$request->input('name')];
            if ($kind==='tag') {
                $category=$request->input('category_id');if ($category && ! DB::table('tag_categories')->where('account_id',$account)->where('id',$category)->exists()) abort(422);
                $values+=['name_slug'=>Str::slug($values['name']),'category_id'=>$category];
            }
            if ($kind==='level') { $request->validate(['dimension'=>'required|in:closeness,importance']);$values+=['dimension'=>$request->input('dimension'),'position'=>$request->input('position',0)]; }
            if ($id=$request->input('id')) {
                $old=DB::table($table)->where('account_id',$account)->where('id',$id)->first();abort_unless($old,404);
                if ($kind==='level' && $old->dimension!==$values['dimension']) abort(422);
                DB::table($table)->where('account_id',$account)->where('id',$id)->update($values);
            } else DB::table($table)->insert($values+['account_id'=>$account]);
        });
        return back()->with('success', trans('organization.settings.updated'));
    }
    public function methods(Request $request,Contact $contact)
    {
        $this->owned($contact);
        $input=$request->validate(['id'=>'nullable|integer','service'=>'required|in:wechat,linkedin,whatsapp','data'=>'nullable|string|max:255','phone_id'=>'nullable|integer','remove'=>'nullable|boolean']);
        DB::transaction(function () use ($contact,$input) {
            app(Defaults::class)->execute($contact->account_id);
            $type=$contact->account->contactFieldTypes()->get()->first(fn ($t)=>strtolower($t->type ?? '')===$input['service'] || strtolower($t->name)===$input['service']);abort_unless($type,422);
            $field=empty($input['id']) ? new ContactField : ContactField::where('account_id',$contact->account_id)->where('contact_id',$contact->id)->findOrFail($input['id']);
            if (!empty($input['remove'])) { $field->delete();return; }
            $field->account_id=$contact->account_id;$field->contact_id=$contact->id;$field->contact_field_type_id=$type->id;
            $field->phone_id=$input['phone_id'] ?? null;$field->data=$input['data'] ?? '';
            if (! $field->data && ! $field->phone_id) abort(422);$field->save();
        });return back();
    }
    public function addresses(Request $request,Contact $contact)
    {
        $this->owned($contact);$request->validate(['address_ids'=>'required|array|min:1','address_ids.*'=>'integer|distinct','action'=>'required|in:link,unlink']);
        DB::transaction(function () use ($request,$contact) {
            $rows=$contact->addresses()->whereIn('id',$request->input('address_ids'))->get();abort_unless($rows->count()===count($request->input('address_ids')),422);
            $group=$request->input('action')==='link' ? (string)Str::uuid() : null;
            if ($group && $rows->count()<2) abort(422);
            $ids=$rows->pluck('id')->all();$groups=$rows->pluck('alternative_group')->filter()->all();
            $contact->addresses()->where(function ($q) use ($ids,$groups) { $q->whereIn('id',$ids)->orWhereIn('alternative_group',$groups); })->update(['alternative_group'=>$group]);
        });return back();
    }
    private function reviewRow(string $id, bool $lock = false)
    {
        $query=DB::table('organization_import_reviews')->where('id',$id)->where('account_id',auth()->user()->account_id)->where('user_id',auth()->id())->where('expires_at','>',now());
        $row = ($lock ? $query->lockForUpdate() : $query)->first();
        abort_unless($row,404);
        return $row;
    }
    public function review(string $id)
    {
        $row=$this->reviewRow($id);$payload=json_decode(Crypt::decryptString($row->payload),true);
        $normalized=app(OrganizationCard::class)->normalize(\Sabre\VObject\Reader::read($payload['entry']));
        $companies=app(ImportOrganization::class)->preflight($row->account_id,$normalized);
        return view('settings.imports.organization-review',compact('row','normalized','companies'));
    }
    public function resolveReview(Request $request,string $id)
    {
        $result=DB::transaction(function () use ($request,$id) {
            $row = $this->reviewRow($id, true);
            $result = null;
            if (! $request->input('skip')) {
                $payload=json_decode(Crypt::decryptString($row->payload),true);
                $result=app(ImportVCard::class)->execute($payload+['account_id'=>$row->account_id,'user_id'=>$row->user_id,'company_choices'=>$request->input('company_choices',[])]);
                if (isset($result['error']) && ! isset($result['review_id']) && $result['error'] !== 'ERROR_CONTACT_EXIST') {
                    return $result;
                }
            }

            $reports = DB::table('import_job_reports')->where('organization_review_id', $id)
                ->where('account_id', $row->account_id)->where('user_id', $row->user_id);
            $report = $reports->lockForUpdate()->first();
            if ($report) {
                $changes = ['organization_review_id' => $result['review_id'] ?? null];
                if ($result && ! isset($result['error']) && $report->skipped) {
                    $changes += ['skipped' => false, 'skip_reason' => null];
                    DB::table('import_jobs')->where('id', $report->import_job_id)->where('account_id', $row->account_id)
                        ->update(['contacts_imported' => DB::raw('contacts_imported + 1'), 'contacts_skipped' => DB::raw('contacts_skipped - 1')]);
                } elseif (isset($result['reason'])) {
                    $changes['skip_reason'] = $result['reason'];
                } elseif ($request->input('skip')) {
                    $changes['skip_reason'] = null;
                }
                $reports->where('id', $report->id)->update($changes);
            }
            DB::table('organization_import_reviews')->where('id',$id)->delete();
            return $result;
        });
        if (isset($result['review_id'])) return redirect()->route('organization.review',$result['review_id']);
        if (isset($result['error']) && $result['error']!=='ERROR_CONTACT_EXIST') return back()->withErrors(['import'=>trans('settings.'.$result['reason'])]);
        return redirect()->route('people.index')->with('success', trans('organization.review.completed'));
    }
}
