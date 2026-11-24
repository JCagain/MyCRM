@php
 $orgAccount=auth()->user()->account_id;
 $orgLevels=DB::table('rating_levels')->where('account_id',$orgAccount)->orderBy('position')->orderBy('id')->get();
 $orgTags=DB::table('tags')->where('account_id',$orgAccount)->orderBy('name')->get();
 $orgCategories=DB::table('tag_categories')->where('account_id',$orgAccount)->get()->keyBy('id');
@endphp
<form method="GET" class="mb3 pa3 ba b--light-gray br2" aria-label="{{ trans('organization.people.filters') }}">
 <div class="flex flex-wrap items-end mb3" style="gap: .75rem 1rem">
  <div style="flex: 0 1 12rem; max-width: 100%">
   <label for="people-search-filter">{{ trans('organization.people.search') }}</label>
   <input class="form-control" id="people-search-filter" name="search" value="{{ request('search') }}">
  </div>
  <div style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); align-items: end; gap: .75rem; width: min(100%, 26rem)">
   <div>
    <label for="people-company-filter">{{ trans('organization.people.company') }}</label>
    <select class="form-control" id="people-company-filter" name="company_id">
     <option value="">{{ trans('organization.people.all_companies') }}</option>
     @foreach (DB::table('companies')->where('account_id',$orgAccount)->orderBy('name')->get() as $company)
      <option value="{{ $company->id }}" @selected(request('company_id')==$company->id)>{{ $company->name }}</option>
     @endforeach
    </select>
   </div>
   <label class="flex items-center mb0 pb1" style="gap: .35rem">
    <input type="checkbox" name="include_former" value="1" @checked(request('include_former'))>
    <span>{{ trans('organization.people.include_former') }}</span>
   </label>
  </div>
 </div>
 @foreach ($orgTags->groupBy(fn($t)=>$t->category_id ?? 'uncategorized') as $category=>$tagsInCategory)
 <fieldset class="mb2"><legend class="f6">{{ $orgCategories[$category]->name ?? trans('organization.people.uncategorized') }}</legend>
 @foreach ($tagsInCategory as $tag)<label class="mr2"><input type="checkbox" name="tag_ids[]" value="{{ $tag->id }}" @checked(in_array($tag->id,request('tag_ids',[])))> {{ $tag->name }}</label>@endforeach
 </fieldset>@endforeach
 @foreach (['closeness','importance'] as $dimension)
 <label>{{ trans('organization.people.'.$dimension) }} <select class="form-control" name="{{ $dimension }}"><option value="">{{ trans('organization.people.any') }}</option><option value="unrated" @selected(request($dimension)==='unrated')>{{ trans('organization.people.unrated') }}</option>
 @foreach ($orgLevels->where('dimension',$dimension) as $level)<option value="{{ $level->id }}" @selected(request($dimension)==$level->id)>{{ \App\Services\Organization\Defaults::ratingLabel($level) }}</option>@endforeach
 </select></label>@endforeach
 <label>{{ trans('organization.people.sort') }} <select name="sort" class="form-control">
 @foreach (['firstnameAZ','firstnameZA','lastnameAZ','lastnameZA','lastactivitydateNewtoOld','lastactivitydateOldtoNew','closeness','importance','last_contacted'] as $value)<option value="{{ $value }}" @selected($sort===$value)>{{ trans('organization.people.'.$value) }}</option>@endforeach
 </select></label>
 <label>{{ trans('organization.people.rows_per_page') }} <select name="perPage" class="form-control">@foreach([10,25,50,100] as $pageSize)<option value="{{ $pageSize }}" @selected((int)request('perPage',config('monica.number_of_contacts_pagination'))===$pageSize)>{{ $pageSize }}</option>@endforeach</select></label>
 @if (! $active)<input type="hidden" name="show_archived" value="true">@endif
 @if (request('show_dead'))<input type="hidden" name="show_dead" value="{{ request('show_dead') }}">@endif
 <button class="btn btn-primary">{{ trans('organization.people.apply_filters') }}</button> <a href="{{ url()->current() }}">{{ trans('organization.people.clear_filters') }}</a>
 <a class="ml3" href="{{ route('organization.settings') }}">{{ trans('organization.people.manage_levels') }}</a>
</form>
