@php($workJobs=$contact->occupations()->with('variants')->orderBy('position')->orderBy('id')->get())
<form method="POST" action="{{ route('organization.work',$contact) }}">@csrf
 @include('partials.errors')
 <h2>{{ trans('organization.work.jobs') }}</h2>
 @foreach($workJobs as $job)
 <fieldset class="mb3 pa3 ba b--light-gray"><legend class="f5"><label><input type="checkbox" name="job_ids[]" value="{{ $job->id }}"> {{ trans('organization.work.select_job') }}</label> {{ $contact->primary_occupation_id===$job->id ? trans('organization.work.primary_job') : trans('organization.work.additional_job') }}</legend>
 <label>{{ trans('organization.work.status') }} <select class="form-control" name="jobs[{{ $job->id }}][status]">@foreach(['unspecified','current','former'] as $status)<option @selected($job->status===$status) value="{{ $status }}">{{ trans('organization.work.'.$status) }}</option>@endforeach</select></label>
 <label>{{ trans('organization.work.company_resolution') }} <select class="form-control" name="jobs[{{ $job->id }}][company_choice]"><option value="{{ $job->company_id }}">{{ trans('organization.work.keep_company') }}</option><option value="">{{ trans('organization.work.match_printed_names') }}</option><option value="new">{{ trans('organization.work.create_company') }}</option>@foreach(DB::table('companies')->where('account_id',$contact->account_id)->orderBy('name')->get() as $company)<option value="{{ $company->id }}">{{ $company->name }}</option>@endforeach</select></label>
 @foreach($job->variants as $i=>$variant)
 <div class="mb2"><label>{{ trans('organization.people.company') }} <input class="form-control" name="jobs[{{ $job->id }}][variants][{{ $i }}][company]" value="{{ $variant->company }}"></label><label>{{ trans('organization.work.title') }} <input class="form-control" name="jobs[{{ $job->id }}][variants][{{ $i }}][title]" value="{{ $variant->title }}"></label>
 <input type="hidden" name="jobs[{{ $job->id }}][variants][{{ $i }}][language]" value="{{ $variant->language }}">
 <button class="btn btn-secondary" name="job_action" value="primary:{{ $variant->id }}">{{ $contact->primary_variant_id===$variant->id ? trans('organization.work.primary_representative') : trans('organization.work.make_primary') }}</button></div>
 @endforeach
 <p>{{ $job->start_date ? $job->start_date->toDateString() : '' }} {{ $job->end_date ? '– '.$job->end_date->toDateString() : '' }}</p>
 @if($job->variants->count()>1)<button class="btn btn-secondary" name="job_action" value="unlink:{{ $job->id }}">{{ trans('organization.work.unlink_variants') }}</button>@endif
 <button class="btn btn-secondary" name="job_action" value="delete:{{ $job->id }}">{{ trans('organization.work.remove_job') }}</button>
 </fieldset>@endforeach
 <fieldset class="mb3"><legend class="f5">{{ trans('organization.work.add_job') }}</legend><label>{{ trans('organization.people.company') }} <input class="form-control" name="jobs[new][variants][0][company]"></label><label>{{ trans('organization.work.title') }} <input class="form-control" name="jobs[new][variants][0][title]"></label><label>{{ trans('organization.work.status') }} <select name="jobs[new][status]" class="form-control">@foreach(['unspecified','current','former'] as $status)<option value="{{ $status }}">{{ trans('organization.work.'.$status) }}</option>@endforeach</select></label></fieldset>
 <label>{{ trans('organization.work.resolution_for_linking') }} <select name="company_choice" class="form-control"><option value="">{{ trans('organization.work.match_automatically') }}</option><option value="new">{{ trans('organization.work.create_company') }}</option>@foreach(DB::table('companies')->where('account_id',$contact->account_id)->orderBy('name')->get() as $company)<option value="{{ $company->id }}">{{ $company->name }}</option>@endforeach</select></label>
 <button class="btn btn-primary" name="job_action" value="save">{{ trans('organization.work.save_jobs') }}</button> <button class="btn btn-secondary" name="job_action" value="link">{{ trans('organization.work.link_jobs') }}</button>
 <a href="{{ route('people.show',$contact) }}">{{ trans('organization.work.back_to_contact') }}</a>
</form>
