@php($workJobs=$contact->occupations()->with('variants')->orderBy('position')->orderBy('id')->get())
<form method="POST" action="{{ route('organization.work',$contact) }}">@csrf
 @include('partials.errors')
 <h2>Jobs and printed language variants</h2>
 @foreach($workJobs as $job)
 <fieldset class="mb3 pa3 ba b--light-gray"><legend class="f5"><label><input type="checkbox" name="job_ids[]" value="{{ $job->id }}"> Select job</label> {{ $contact->primary_occupation_id===$job->id ? 'Primary job' : 'Additional job' }}</legend>
 <label>Status <select class="form-control" name="jobs[{{ $job->id }}][status]">@foreach(['unspecified','current','former'] as $status)<option @selected($job->status===$status) value="{{ $status }}">{{ ucfirst($status) }}</option>@endforeach</select></label>
 <label>Company resolution <select class="form-control" name="jobs[{{ $job->id }}][company_choice]"><option value="{{ $job->company_id }}">Keep current company</option><option value="">Match printed names</option><option value="new">Create separate company</option>@foreach(DB::table('companies')->where('account_id',$contact->account_id)->orderBy('name')->get() as $company)<option value="{{ $company->id }}">{{ $company->name }}</option>@endforeach</select></label>
 @foreach($job->variants as $i=>$variant)
 <div class="mb2"><label>Company <input class="form-control" name="jobs[{{ $job->id }}][variants][{{ $i }}][company]" value="{{ $variant->company }}"></label><label>Title <input class="form-control" name="jobs[{{ $job->id }}][variants][{{ $i }}][title]" value="{{ $variant->title }}"></label>
 <input type="hidden" name="jobs[{{ $job->id }}][variants][{{ $i }}][language]" value="{{ $variant->language }}">
 <button class="btn btn-secondary" name="job_action" value="primary:{{ $variant->id }}">{{ $contact->primary_variant_id===$variant->id ? 'Primary representative' : 'Make primary' }}</button></div>
 @endforeach
 <p>{{ $job->start_date ? $job->start_date->toDateString() : '' }} {{ $job->end_date ? '– '.$job->end_date->toDateString() : '' }}</p>
 @if($job->variants->count()>1)<button class="btn btn-secondary" name="job_action" value="unlink:{{ $job->id }}">Unlink language variants</button>@endif
 <button class="btn btn-secondary" name="job_action" value="delete:{{ $job->id }}">Remove job</button>
 </fieldset>@endforeach
 <fieldset class="mb3"><legend class="f5">Add job</legend><label>Company <input class="form-control" name="jobs[new][variants][0][company]"></label><label>Title <input class="form-control" name="jobs[new][variants][0][title]"></label><label>Status <select name="jobs[new][status]" class="form-control">@foreach(['unspecified','current','former'] as $status)<option value="{{ $status }}">{{ ucfirst($status) }}</option>@endforeach</select></label></fieldset>
 <label>Company resolution for linking <select name="company_choice" class="form-control"><option value="">Match automatically when unambiguous</option><option value="new">Create separate company</option>@foreach(DB::table('companies')->where('account_id',$contact->account_id)->orderBy('name')->get() as $company)<option value="{{ $company->id }}">{{ $company->name }}</option>@endforeach</select></label>
 <button class="btn btn-primary" name="job_action" value="save">Save jobs</button> <button class="btn btn-secondary" name="job_action" value="link">Link selected jobs as language variants</button>
 <a href="{{ route('people.show',$contact) }}">Back to contact</a>
</form>
