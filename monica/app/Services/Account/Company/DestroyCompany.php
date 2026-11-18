<?php

namespace App\Services\Account\Company;

use App\Services\BaseService;
use App\Models\Account\Company;

class DestroyCompany extends BaseService
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
            'company_id' => 'required|integer|exists:companies,id',
        ];
    }

    /**
     * Destroy a company.
     *
     * @param  array  $data
     * @return bool
     */
    public function execute(array $data): bool
    {
        $this->validate($data);

        $company = Company::where('account_id', $data['account_id'])
            ->findOrFail($data['company_id']);

        \Illuminate\Support\Facades\DB::transaction(function () use ($company) {
            foreach ($company->occupations()->with('contact')->get() as $occupation) {
                app(\App\Services\Organization\Work::class)->remove($occupation->contact,$occupation);
            }
            $company->delete();
        });

        return true;
    }
}
