<?php

namespace App\Services\Contact\Occupation;

use App\Services\BaseService;
use Illuminate\Validation\Rule;
use App\Models\Contact\Occupation;

class UpdateOccupation extends BaseService
{
    /**
     * Get the validation rules that apply to the service.
     *
     * @return array
     */
    public function rules()
    {
        return [
            'account_id' => 'required|integer|exists:accounts,id',
            'contact_id' => 'required|integer|exists:contacts,id',
            'company_id' => 'nullable|integer|exists:companies,id',
            'occupation_id' => 'required|integer|exists:occupations,id',
            'title' => 'nullable|string|max:255',
            'description' => 'nullable|string|max:1000',
            'salary' => 'nullable|integer',
            'salary_unit' => [
                'nullable',
                Rule::in(Occupation::$salaryUnits),
            ],
            'currently_works_here' => 'nullable|boolean',
            'start_date' => 'nullable|date_format:Y-m-d',
            'end_date' => 'nullable|date_format:Y-m-d',
        ];
    }

    /**
     * Update a occupation.
     *
     * @param  array  $data
     * @return Occupation
     */
    public function execute(array $data): Occupation
    {
        $this->validate($data);

        return \Illuminate\Support\Facades\DB::transaction(function () use ($data) {
        /** @var Occupation */
        $occupation = Occupation::where('account_id', $data['account_id'])
            ->where('contact_id', $data['contact_id'])
            ->findOrFail($data['occupation_id']);

        $occupation->contact->throwInactive();
        if (! empty($data['company_id'])) \App\Models\Account\Company::where('account_id',$data['account_id'])->findOrFail($data['company_id']);
        if (empty($data['company_id']) && empty($data['title'])) throw \Illuminate\Validation\ValidationException::withMessages(['title'=>'Supply company or title.']);

        $occupation->update([
            'company_id' => $data['company_id'] ?? null,
            'title' => $data['title'] ?? null,
            'description' => $this->nullOrValue($data, 'description'),
            'salary' => $this->nullOrValue($data, 'salary'),
            'salary_unit' => $this->nullOrValue($data, 'salary_unit'),
            'currently_works_here' => $this->nullOrValue($data, 'currently_works_here'),
            'status' => !isset($data['currently_works_here']) ? 'unspecified' : ($data['currently_works_here'] ? 'current' : 'former'),
            'start_date' => $this->nullOrDate($data, 'start_date'),
            'end_date' => $this->nullOrDate($data, 'end_date'),
        ]);

        $variant=$occupation->variants()->first();
        if ($variant) $variant->update(['company'=>$occupation->company->name ?? null,'title'=>$occupation->title]);
        else $variant=$occupation->variants()->create(['company'=>$occupation->company->name ?? null,'title'=>$occupation->title,'position'=>0]);
        if ($occupation->contact->primary_occupation_id===$occupation->id) app(\App\Services\Organization\Work::class)->project($occupation->contact,$occupation,$variant);

        return $occupation;
        });
    }
}
