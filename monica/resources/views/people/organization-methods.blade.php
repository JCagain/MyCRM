<div class="sidebar-box"><h3>Contact methods and language links</h3>@include('partials.errors')
@php($methodTypes=$contact->account->contactFieldTypes()->get())
@foreach(['wechat'=>'WeChat','linkedin'=>'LinkedIn','whatsapp'=>'WhatsApp'] as $service=>$heading)
<h4>{{ $heading }}</h4>
@php($type=$methodTypes->first(fn($t)=>strtolower($t->type ?? '')===$service || strtolower($t->name)===$service))
@php($entries=$type ? $contact->contactFields()->where('contact_field_type_id',$type->id)->get() : collect())
@foreach($entries->push(new \App\Models\Contact\ContactField) as $entry)
<form method="POST" action="{{ route('organization.methods',$contact) }}" class="mb2">@csrf
<input type="hidden" name="service" value="{{ $service }}"><input type="hidden" name="id" value="{{ $entry->id }}">
<label>{{ $entry->id ? $heading.' value' : 'Add '.$heading }} <input class="form-control" name="data" value="{{ $entry->data }}" maxlength="255"></label>
@if($service==='whatsapp')<label>Number source <select name="phone_id" class="form-control"><option value="">Independent number</option>@foreach($contact->contactFields()->phone()->get() as $phone)<option value="{{ $phone->id }}" @selected($entry->phone_id===$phone->id)>{{ $phone->data }}</option>@endforeach</select></label>@endif
<button class="btn btn-secondary">Save</button>@if($entry->id)<button class="btn btn-secondary" name="remove" value="1">Remove</button>@endif
</form>@endforeach
@endforeach
<h4>Address language variants</h4>
<form method="POST" action="{{ route('organization.addresses',$contact) }}">@csrf
@foreach($contact->addresses->groupBy(fn($a)=>$a->alternative_group ?? 'single-'.$a->id) as $addressGroup)
<fieldset class="mb2"><legend class="f6">{{ $addressGroup->first()->alternative_group ? 'Linked address variants' : 'Independent address' }}</legend>
@foreach($addressGroup as $address)<label class="db"><input type="checkbox" name="address_ids[]" value="{{ $address->id }}">{{ $address->po_box }} {{ $address->extended }} {{ $address->place->street ?? '' }} {{ $address->place->city ?? '' }} {{ $address->place->province ?? '' }} {{ $address->place->postal_code ?? '' }} {{ $address->printed_country }} @if($address->language)<small>{{ $address->language }}</small>@endif</label>@endforeach
</fieldset>@endforeach
<button class="btn btn-secondary" name="action" value="link">Link selected addresses</button><button class="btn btn-secondary" name="action" value="unlink">Unlink selected groups</button>
</form>
<p>Last contacted: {{ $contact->last_contacted ? $contact->last_contacted->toDateString() : 'No interactions' }}</p>
</div>
