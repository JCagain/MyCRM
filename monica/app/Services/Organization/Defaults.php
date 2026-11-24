<?php
namespace App\Services\Organization;
use Illuminate\Support\Facades\DB;

class Defaults
{
    private const RATING_KEYS = [
        'closeness' => ['acquaintance', 'familiar', 'close'],
        'importance' => ['low', 'medium', 'high'],
    ];

    public static function ratingLabel(object $level): string
    {
        $key = self::RATING_KEYS[$level->dimension][$level->seed_key] ?? null;
        if ($key !== null && $level->name === trans('organization.settings.'.$key, [], 'en')) {
            return trans('organization.settings.'.$key);
        }

        return $level->name;
    }

    public function execute(int $account): void
    {
        foreach (self::RATING_KEYS as $dimension => $ratingKeys) {
            foreach ($ratingKeys as $position => $ratingKey) {
                $name = trans('organization.settings.'.$ratingKey, [], 'en');
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
