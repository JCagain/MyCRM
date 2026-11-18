<?php

namespace App\Models\Contact;

use App\Traits\HasUuid;
use App\Models\Account\Account;
use App\Interfaces\LabelInterface;
use App\Models\ModelBindingWithContact as Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class ContactField extends Model implements LabelInterface
{
    protected static function booted()
    {
        static::saving(function ($field) {
            $type=ContactFieldType::where('account_id',$field->account_id)->findOrFail($field->contact_field_type_id);
            $changedIdentity=$field->exists && ($field->isDirty('contact_id') || $field->isDirty('contact_field_type_id'));
            if ($changedIdentity && $field->phone_id && ! $field->isDirty('phone_id')) {
                $field->phone_id=null;
                $field->data=$field->getRawOriginal('data');
            }
            if ($field->phone_id) {
                $phone=self::where('account_id',$field->account_id)->where('contact_id',$field->contact_id)->phone()->findOrFail($field->phone_id);
                if (! in_array(strtolower($type->type ?? $type->name),['whatsapp']) || $phone->id===$field->id) throw \Illuminate\Validation\ValidationException::withMessages(['phone_id'=>'Select a phone belonging to this contact for WhatsApp.']);
                $field->data=$phone->data;
            }
            if ($changedIdentity) $field->releasePhoneReferences();
        });
        static::saved(function ($field) {
            if ($field->wasChanged('data')) self::where('phone_id',$field->id)->update(['data'=>$field->data]);
        });
        static::deleting(fn ($field)=>$field->releasePhoneReferences());
    }

    public function releasePhoneReferences(): void
    {
        self::where('phone_id',$this->id)->update(['data'=>$this->getRawOriginal('data'),'phone_id'=>null]);
    }
    use HasUuid;

    /**
     * The attributes that aren't mass assignable.
     *
     * @var array<string>|bool
     */
    protected $guarded = ['id'];

    /**
     * All of the relationships to be touched.
     *
     * @var array
     */
    protected $touches = ['contact'];

    /**
     * Get the account record associated with the contact field.
     *
     * @return BelongsTo
     */
    public function account()
    {
        return $this->belongsTo(Account::class);
    }

    /**
     * Get the contact record associated with the contact field.
     *
     * @return BelongsTo
     */
    public function contact()
    {
        return $this->belongsTo(Contact::class);
    }

    /**
     * Get the label associated with the contact.
     *
     * @return BelongsToMany
     */
    public function labels()
    {
        return $this->belongsToMany(ContactFieldLabel::class);
    }

    /**
     * Get the type associated with the contact field.
     *
     * @return BelongsTo
     */
    public function contactFieldType()
    {
        return $this->belongsTo(ContactFieldType::class);
    }

    /**
     * Scope a query to only include contact field of email type.
     *
     * @param  \Illuminate\Database\Eloquent\Builder  $query
     * @return \Illuminate\Database\Eloquent\Builder
     */
    public function scopeEmail($query)
    {
        return $query->whereHas('contactFieldType', function ($query) {
            $query->where('type', '=', ContactFieldType::EMAIL);
        });
    }

    /**
     * Scope a query to only include contact field of phone type.
     *
     * @param  \Illuminate\Database\Eloquent\Builder  $query
     * @return \Illuminate\Database\Eloquent\Builder
     */
    public function scopePhone($query)
    {
        return $query->whereHas('contactFieldType', function ($query) {
            $query->where('type', '=', ContactFieldType::PHONE);
        });
    }
}
