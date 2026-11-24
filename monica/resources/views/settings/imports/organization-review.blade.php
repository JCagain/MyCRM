@extends('layouts.skeleton')
@section('content')
<div class="main-content central-form"><div class="container"><h1>{{ trans('organization.review.title') }}</h1>@include('partials.errors')
 <p>{{ trans('organization.review.description') }}</p>
 <form method="POST" action="{{ route('organization.resolve-review',$row->id) }}">@csrf
 @foreach($normalized['jobs'] as $index=>$job)
 @if(isset($companies[$index]))<fieldset><legend class="f5">{{ trans('organization.review.job', ['number' => $index + 1]) }}</legend>@foreach($job['variants'] as $variant)<p>{{ $variant['company'] }} · {{ $variant['title'] }}</p>@endforeach
 <label>{{ trans('organization.people.company') }} <select name="company_choices[{{ $index }}]" class="form-control" required><option value="">{{ trans('organization.review.choose_company') }}</option>@foreach($companies[$index] as $company)<option value="{{ $company->id }}">{{ $company->name }} (#{{ $company->id }})</option>@endforeach<option value="new">{{ trans('organization.review.create_company') }}</option></select></label></fieldset>@endif
 @endforeach
 <button class="btn btn-primary">{{ trans('organization.review.resume') }}</button> <button class="btn btn-secondary" name="skip" value="1" formnovalidate>{{ trans('organization.review.skip') }}</button>
 </form></div></div>
@endsection
