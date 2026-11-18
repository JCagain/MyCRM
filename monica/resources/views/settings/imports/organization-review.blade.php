@extends('layouts.skeleton')
@section('content')
<div class="main-content central-form"><div class="container"><h1>Resolve company matches</h1>@include('partials.errors')
 <p>No contact or company changes have been applied for this card. Review expires after 24 hours.</p>
 <form method="POST" action="{{ route('organization.resolve-review',$row->id) }}">@csrf
 @foreach($normalized['jobs'] as $index=>$job)
 @if(isset($companies[$index]))<fieldset><legend class="f5">Job {{ $index+1 }}</legend>@foreach($job['variants'] as $variant)<p>{{ $variant['company'] }} · {{ $variant['title'] }}</p>@endforeach
 <label>Company <select name="company_choices[{{ $index }}]" class="form-control" required><option value="">Choose company</option>@foreach($companies[$index] as $company)<option value="{{ $company->id }}">{{ $company->name }} (#{{ $company->id }})</option>@endforeach<option value="new">Create a separate company</option></select></label></fieldset>@endif
 @endforeach
 <button class="btn btn-primary">Resume import</button> <button class="btn btn-secondary" name="skip" value="1" formnovalidate>Skip card</button>
 </form></div></div>
@endsection
