<?php
namespace App\Models\Contact;
use Illuminate\Database\Eloquent\Model;
class JobVariant extends Model
{
    public $timestamps = false;
    protected $guarded = ['id'];
    public function occupation() { return $this->belongsTo(Occupation::class); }
}
