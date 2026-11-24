@php
 $orgTags=DB::table('tags')->where('account_id',auth()->user()->account_id)->orderBy('name')->get();
 $orgLevels=DB::table('rating_levels')->where('account_id',auth()->user()->account_id)->orderBy('position')->orderBy('id')->get();
@endphp
<form method="POST" action="{{ route('organization.batch') }}" aria-label="{{ trans('organization.people.batch_edit') }}">@csrf
 @include('partials.errors')
 <fieldset class="pa3"><legend class="f6">{{ trans('organization.people.edit_selected') }}</legend>
 <div class="mb3" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; max-width: 30rem">
  @foreach (['add_tags', 'remove_tags'] as $field)
   <details class="relative" name="batch-tag-actions">
    <summary class="form-control pointer" style="box-sizing: border-box">{{ trans('organization.people.'.$field) }} <span class="fr" aria-hidden="true">&#9662;</span></summary>
    <div class="absolute left-0 right-0 z-2 ba b--silver br2 bg-white pa2 shadow-2" style="max-height: 14rem; overflow: auto; overflow-wrap: anywhere">
     @forelse ($orgTags as $tag)
      <label class="db mb1">
       <input type="checkbox" name="{{ $field }}[]" value="{{ $tag->id }}" @checked(in_array($tag->id, (array) old($field)))> {{ $tag->name }}
      </label>
     @empty
      <span class="f6">{{ trans('organization.people.no_tags') }}</span>
     @endforelse
    </div>
   </details>
  @endforeach
 </div>
 @foreach(['closeness','importance'] as $dimension)<label>{{ trans('organization.people.'.$dimension) }} <select name="{{ $dimension }}" class="form-control"><option value="keep">{{ trans('organization.people.keep_existing') }}</option><option value="">{{ trans('organization.people.clear_rating') }}</option>@foreach($orgLevels->where('dimension',$dimension) as $level)<option value="{{ $level->id }}">{{ \App\Services\Organization\Defaults::ratingLabel($level) }}</option>@endforeach</select></label>@endforeach
 <div class="flex flex-wrap items-center" style="gap: .5rem 1rem">
  <button type="submit" class="btn btn-secondary">{{ trans('organization.people.apply_selected') }}</button>
  @if ($active && $organizationContacts->isNotEmpty())
   <button type="submit" class="btn btn-danger" formaction="{{ route('organization.delete.confirm', request()->query()) }}">
    {{ trans('people.people_bulk_delete_action') }}
   </button>
  @endif
 </div>
 </fieldset>
 <div style="overflow-x:auto"><table class="vgt-table"><thead><tr><th>{{ trans('organization.people.select') }}</th><th>{{ trans('app.contact_list_avatar') }}</th><th>{{ trans('app.contact_list_name') }}</th><th>{{ trans('app.contact_list_description') }}</th><th>{{ trans('organization.people.last_contacted') }}</th></tr></thead><tbody>
 @forelse($organizationContacts as $person)<tr><td><input type="checkbox" name="contact_ids[]" value="{{ $person->id }}" aria-label="{{ trans('organization.people.select_person', ['name' => $person->name]) }}"></td>
 <td>@if($person->getAvatarURL())<img src="{{ $person->getAvatarURL() }}" width="43" height="43" class="avatar-search" alt="">@else<span class="dib tc white br2" style="width:43px;height:43px;line-height:43px;background-color:{{ $person->default_avatar_color }}">{{ $person->getInitials() }}</span>@endif</td>
 <td><a href="{{ route('people.show',$person) }}">{{ $person->name }}</a>@if($person->is_starred)<span aria-label="{{ trans('organization.people.starred') }}"> ★</span>@endif</td><td>{{ $person->description }}</td><td>{{ $person->last_contacted ? $person->last_contacted->toDateString() : trans('organization.people.no_interactions') }}</td></tr>
 @empty<tr><td colspan="5">{{ trans('organization.people.no_people') }}</td></tr>@endforelse
 </tbody></table></div>
</form>
{{ $organizationContacts->links() }}
