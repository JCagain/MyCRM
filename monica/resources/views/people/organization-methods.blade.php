<div class="sidebar-box"><h3>{{ trans('organization.contact.methods') }}</h3>@include('partials.errors')
@php($methodTypes=$contact->account->contactFieldTypes()->get())
@foreach(['wechat'=>trans('organization.contact.wechat'),'linkedin'=>'LinkedIn','whatsapp'=>'WhatsApp'] as $service=>$heading)
<h4>{{ $heading }}</h4>
@php($type=$methodTypes->first(fn($t)=>strtolower($t->type ?? '')===$service || strtolower($t->name)===$service))
@php($entries=$type ? $contact->contactFields()->where('contact_field_type_id',$type->id)->get() : collect())
@foreach($entries->push(new \App\Models\Contact\ContactField) as $entry)
<form method="POST" action="{{ route('organization.methods',$contact) }}" class="mb2">@csrf
<input type="hidden" name="service" value="{{ $service }}"><input type="hidden" name="id" value="{{ $entry->id }}">
<label>{{ trans($entry->id ? 'organization.contact.edit_method' : 'organization.contact.add_method', ['service' => $heading]) }} <input class="form-control" name="data" value="{{ $entry->data }}" maxlength="255"></label>
@if($service==='whatsapp')<label>{{ trans('organization.contact.number_source') }} <select name="phone_id" class="form-control"><option value="">{{ trans('organization.contact.independent_number') }}</option>@foreach($contact->contactFields()->phone()->get() as $phone)<option value="{{ $phone->id }}" @selected($entry->phone_id===$phone->id)>{{ $phone->data }}</option>@endforeach</select></label>@endif
<button class="btn btn-secondary">{{ trans('app.save') }}</button>@if($entry->id)<button class="btn btn-secondary" name="remove" value="1">{{ trans('app.remove') }}</button>@endif
</form>@endforeach
@endforeach
<h4>{{ trans('organization.contact.address_variants') }}</h4>
<form method="POST" action="{{ route('organization.addresses',$contact) }}">@csrf
@foreach($contact->addresses->groupBy(fn($a)=>$a->alternative_group ?? 'single-'.$a->id) as $addressGroup)
<fieldset class="mb2"><legend class="f6">{{ $addressGroup->first()->alternative_group ? trans('organization.contact.linked_addresses') : trans('organization.contact.independent_address') }}</legend>
@foreach($addressGroup as $address)<label class="db"><input type="checkbox" name="address_ids[]" value="{{ $address->id }}">{{ $address->po_box }} {{ $address->extended }} {{ $address->place->street ?? '' }} {{ $address->place->city ?? '' }} {{ $address->place->province ?? '' }} {{ $address->place->postal_code ?? '' }} {{ $address->printed_country }} @if($address->language)<small>{{ $address->language }}</small>@endif</label>@endforeach
</fieldset>@endforeach
<button class="btn btn-secondary" name="action" value="link">{{ trans('organization.contact.link_addresses') }}</button><button class="btn btn-secondary" name="action" value="unlink">{{ trans('organization.contact.unlink_addresses') }}</button>
</form>
<p>{{ trans('organization.contact.last_contacted_summary', ['date' => $contact->last_contacted?->toDateString() ?? trans('organization.people.no_interactions')]) }}</p>
</div>
