<?php

namespace App\Http\Requests;

class ImportsRequest extends AuthorizedRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array
     */
    public function rules()
    {
        return [
            'vcard' => ['required', 'file', 'max:'.(config('monica.vcard_import_max_size_mib') * 1024), 'mimes:vcf,vcard'],
        ];
    }
}
