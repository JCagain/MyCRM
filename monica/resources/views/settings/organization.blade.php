@extends('layouts.skeleton')
@section('content')
<div class="main-content central-form"><div class="container"><h1>Categories and rating levels</h1>@include('partials.errors')
 <a href="{{ route('people.index') }}">Back to people</a>
 @foreach(['category'=>'tag_categories','tag'=>'tags','level'=>'rating_levels'] as $kind=>$table)
 <h2>{{ ['category'=>'Categories','tag'=>'Tags','level'=>'Levels'][$kind] }}</h2>
 @foreach(DB::table($table)->where('account_id',$account)->orderBy('id')->get()->push((object)['id'=>null,'name'=>'']) as $item)
 <form method="POST" action="{{ route('organization.settings.save') }}" class="mb3 pa2 ba b--light-gray">@csrf
 <input type="hidden" name="kind" value="{{ $kind }}"><input type="hidden" name="id" value="{{ $item->id }}">
 <label>{{ $item->id ? 'Name' : 'New '.$kind }} <input class="form-control" name="name" value="{{ $item->name }}" required maxlength="255"></label>
 @if($kind==='tag')<label>Category <select class="form-control" name="category_id"><option value="">Uncategorized</option>@foreach(DB::table('tag_categories')->where('account_id',$account)->get() as $category)<option value="{{ $category->id }}" @selected(($item->category_id ?? null)===$category->id)>{{ $category->name }}</option>@endforeach</select></label>@endif
 @if($kind==='level')<label>Dimension <select class="form-control" name="dimension">@foreach(['closeness','importance'] as $d)<option value="{{ $d }}" @selected(($item->dimension ?? '')===$d)>{{ ucfirst($d) }}</option>@endforeach</select></label><label>Sort position <input class="form-control" type="number" min="0" max="10000" name="position" value="{{ $item->position ?? 0 }}"></label>@endif
 <button class="btn btn-primary">{{ $item->id ? 'Save' : 'Add' }}</button>
 </form>@endforeach
 @endforeach
</div></div>
@endsection
