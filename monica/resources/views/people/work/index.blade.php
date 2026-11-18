<div class="sidebar-box">

  <div class="sidebar-box-title">
    <h3>{{ trans('people.work_information') }}</h3>
  </div>

  <div class="work">
    <ul>
      @foreach($contact->occupations()->with('variants')->orderBy('position')->orderBy('id')->get() as $job)
      <li class="mb2">@foreach($job->variants as $variant)<div>{{ $variant->title }} @if($variant->company)<a href="{{ route('people.index',['company_id'=>$job->company_id]) }}">{{ $variant->company }}</a>@endif</div>@endforeach<small>{{ ucfirst($job->status) }}{{ $contact->primary_occupation_id===$job->id ? ' · Primary' : '' }}</small></li>
      @endforeach

      {{-- Work information --}}
      @if(! $contact->occupations()->exists())<li>
        <i class="fa fa-building-o" aria-hidden="true"></i>
        @if (is_null($contact->job) and is_null($contact->company))
          {{ trans('people.information_no_work_defined') }}
        @else
          @if (!is_null($contact->job))
            {{ $contact->job }}

            @if (!is_null($contact->company))
              {{ trans('people.information_work_at', ['company' => $contact->company]) }}
            @endif
          @else
            {{ $contact->company }}
          @endif

        @endif
      </li>@endif
    </ul>

    <p class="sidebar-box-paragraph">
      <a href="{{ route('people.work.edit', $contact) }}">{{ trans('people.work_add_cta') }}</a>
    </p>
  </div>

</div>
