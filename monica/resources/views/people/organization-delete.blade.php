@extends('layouts.skeleton')

@section('content')
  <div class="main-content central-form">
    <div class="{{ auth()->user()->getFluidLayout() }}">
      <div class="row">
        <div class="col-12 col-md-8">
          <div class="ba b--light-gray br2 bg-white pa3">
            <h1 class="f3">{{ trans_choice('people.people_bulk_delete_title', $contacts->count()) }}</h1>
            <p>{{ trans('people.people_bulk_delete_confirmation') }}</p>
            <ul tabindex="0" style="max-height: min(50vh, 20rem); overflow-y: auto">
              @foreach ($contacts as $contact)
                <li>{{ $contact->name }}</li>
              @endforeach
            </ul>

            <form method="POST" action="{{ route('organization.delete', $filters) }}">
              @csrf
              @method('DELETE')
              <input type="hidden" name="confirmed" value="1">
              @foreach ($contacts as $contact)
                <input type="hidden" name="contact_ids[]" value="{{ $contact->id }}">
              @endforeach
              <a class="btn btn-secondary mr2" href="{{ route('people.index', $filters) }}">{{ trans('app.cancel') }}</a>
              <button type="submit" class="btn btn-danger">{{ trans('people.people_bulk_delete_action') }}</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
@endsection
