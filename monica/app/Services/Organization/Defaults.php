<?php
namespace App\Services\Organization;
use Illuminate\Support\Facades\DB;

class Defaults
{
    public function execute(int $account): void
    {
        foreach (['closeness'=>['Acquaintance','Familiar','Close'], 'importance'=>['Low','Medium','High']] as $dimension=>$names) {
            foreach ($names as $position=>$name) {
                $key = ['account_id'=>$account,'dimension'=>$dimension,'seed_key'=>(string)$position];
                if (! DB::table('rating_levels')->where($key)->exists()) DB::table('rating_levels')->insert($key+['name'=>$name,'position'=>$position]);
            }
        }
        $types = DB::table('contact_field_types')->where('account_id',$account)->get();
        $wechat=$types->first(fn ($t)=>in_array(mb_strtolower($t->name),['wechat','weixin','微信','微信号','微信號']) || mb_strtolower($t->type ?? '')==='wechat');
        if ($wechat && $wechat->type!=='wechat') DB::table('contact_field_types')->where('id',$wechat->id)->update(['type'=>'wechat']);
        if (! $wechat) {
            DB::table('contact_field_types')->insert(['account_id'=>$account,'name'=>'WeChat','type'=>'wechat','delible'=>true,'fontawesome_icon'=>null,'protocol'=>null]);
        }
    }
}
