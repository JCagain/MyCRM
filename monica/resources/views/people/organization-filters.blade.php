@php
 $orgAccount=auth()->user()->account_id;
 $orgLevels=DB::table('rating_levels')->where('account_id',$orgAccount)->orderBy('position')->orderBy('id')->get();
 $orgTags=DB::table('tags')->where('account_id',$orgAccount)->orderBy('name')->get();
 $orgCategories=DB::table('tag_categories')->where('account_id',$orgAccount)->get()->keyBy('id');
@endphp
<form method="GET" class="mb3 pa3 ba b--light-gray br2" aria-label="People filters">
 <label>Search <input class="form-control" name="search" value="{{ request('search') }}"></label>
 <label>Company <select class="form-control" name="company_id"><option value="">All companies</option>
 @foreach (DB::table('companies')->where('account_id',$orgAccount)->orderBy('name')->get() as $company)
 <option value="{{ $company->id }}" @selected(request('company_id')==$company->id)>{{ $company->name }}</option>
 @endforeach</select></label>
 <label><input type="checkbox" name="include_former" value="1" @checked(request('include_former'))> Include former memberships</label>
 @foreach ($orgTags->groupBy(fn($t)=>$t->category_id ?? 'uncategorized') as $category=>$tagsInCategory)
 <fieldset class="mb2"><legend class="f6">{{ $orgCategories[$category]->name ?? 'Uncategorized' }}</legend>
 @foreach ($tagsInCategory as $tag)<label class="mr2"><input type="checkbox" name="tag_ids[]" value="{{ $tag->id }}" @checked(in_array($tag->id,request('tag_ids',[])))> {{ $tag->name }}</label>@endforeach
 </fieldset>@endforeach
 @foreach (['closeness','importance'] as $dimension)
 <label>{{ ucfirst($dimension) }} <select class="form-control" name="{{ $dimension }}"><option value="">Any</option><option value="unrated" @selected(request($dimension)==='unrated')>Unrated</option>
 @foreach ($orgLevels->where('dimension',$dimension) as $level)<option value="{{ $level->id }}" @selected(request($dimension)==$level->id)>{{ $level->name }}</option>@endforeach
 </select></label>@endforeach
 <label>Sort <select name="sort" class="form-control">
 @foreach (['firstnameAZ'=>'First name A–Z','firstnameZA'=>'First name Z–A','lastnameAZ'=>'Last name A–Z','lastnameZA'=>'Last name Z–A','lastactivitydateNewtoOld'=>'Last activity newest','lastactivitydateOldtoNew'=>'Last activity oldest','closeness'=>'Closeness','importance'=>'Importance','last_contacted'=>'Last contacted'] as $value=>$label)<option value="{{ $value }}" @selected($sort===$value)>{{ $label }}</option>@endforeach
 </select></label>
 <label>Rows per page <select name="perPage" class="form-control">@foreach([10,25,50,100] as $pageSize)<option value="{{ $pageSize }}" @selected((int)request('perPage',config('monica.number_of_contacts_pagination'))===$pageSize)>{{ $pageSize }}</option>@endforeach</select></label>
 @if (! $active)<input type="hidden" name="show_archived" value="true">@endif
 @if (request('show_dead'))<input type="hidden" name="show_dead" value="{{ request('show_dead') }}">@endif
 <button class="btn btn-primary">Apply filters</button> <a href="{{ url()->current() }}">Clear filters</a>
 <a class="ml3" href="{{ route('organization.settings') }}">Manage categories and levels</a>
</form>
