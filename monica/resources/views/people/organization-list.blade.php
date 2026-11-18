@php
 $orgTags=DB::table('tags')->where('account_id',auth()->user()->account_id)->orderBy('name')->get();
 $orgLevels=DB::table('rating_levels')->where('account_id',auth()->user()->account_id)->orderBy('position')->orderBy('id')->get();
@endphp
<form method="POST" action="{{ route('organization.batch') }}" aria-label="Batch edit people">@csrf
 @include('partials.errors')
 <fieldset class="pa3"><legend class="f6">Edit selected people on this page</legend>
 <label>Add tags <select name="add_tags[]" multiple class="form-control">@foreach($orgTags as $tag)<option value="{{ $tag->id }}">{{ $tag->name }}</option>@endforeach</select></label>
 <label>Remove tags <select name="remove_tags[]" multiple class="form-control">@foreach($orgTags as $tag)<option value="{{ $tag->id }}">{{ $tag->name }}</option>@endforeach</select></label>
 @foreach(['closeness','importance'] as $dimension)<label>{{ ucfirst($dimension) }} <select name="{{ $dimension }}" class="form-control"><option value="keep">Keep existing</option><option value="">Clear to Unrated</option>@foreach($orgLevels->where('dimension',$dimension) as $level)<option value="{{ $level->id }}">{{ $level->name }}</option>@endforeach</select></label>@endforeach
 <button class="btn btn-secondary">Apply to selected people</button>
 </fieldset>
 <div style="overflow-x:auto"><table class="vgt-table"><thead><tr><th>Select</th><th>{{ trans('app.contact_list_avatar') }}</th><th>{{ trans('app.contact_list_name') }}</th><th>{{ trans('app.contact_list_description') }}</th><th>Last contacted</th></tr></thead><tbody>
 @forelse($organizationContacts as $person)<tr><td><input type="checkbox" name="contact_ids[]" value="{{ $person->id }}" aria-label="Select {{ $person->name }}"></td>
 <td>@if($person->getAvatarURL())<img src="{{ $person->getAvatarURL() }}" width="43" height="43" class="avatar-search" alt="">@else<span class="dib tc white br2" style="width:43px;height:43px;line-height:43px;background-color:{{ $person->default_avatar_color }}">{{ $person->getInitials() }}</span>@endif</td>
 <td><a href="{{ route('people.show',$person) }}">{{ $person->name }}</a>@if($person->is_starred)<span aria-label="Starred"> ★</span>@endif</td><td>{{ $person->description }}</td><td>{{ $person->last_contacted ? $person->last_contacted->toDateString() : 'No interactions' }}</td></tr>
 @empty<tr><td colspan="5">No people match these filters.</td></tr>@endforelse
 </tbody></table></div>
</form>
{{ $organizationContacts->links() }}
