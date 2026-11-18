<?php
namespace App\Services\VCard;

use Sabre\VObject\Component\VCard;
use Illuminate\Validation\ValidationException;

/** Normalize the converter wire contract without database writes or inferred links. */
class OrganizationCard
{
    private function fail(): void { throw ValidationException::withMessages(['vcard'=>'Invalid or ambiguous organization metadata. Review this card before importing.']); }
    private function text($property): string { $text=(string)$property;if (mb_strlen($text)>255) $this->fail();return $text; }
    public function normalize(VCard $card): array
    {
        $jobs=[];$addresses=[];$methods=[];$phones=[];$links=[];$altids=[];$structured=false;
        foreach ($card->children() as $p) {
            $name=strtoupper($p->name);$group=strtolower($p->group ?? '');
            if (in_array($name,['ORG','TITLE','X-C2V-JOB-STATUS'])) {
                if ($group || isset($p['X-C2V-PAIR']) || isset($p['ALTID']) || $name==='X-C2V-JOB-STATUS') $structured=true;
                $key=$group ?: 'ungrouped';
                $jobs[$key] ??= ['status'=>'unspecified','variants'=>[],'statuses'=>[]];
                if ($name==='X-C2V-JOB-STATUS') {
                    $status=strtolower((string)$p);
                    if (! in_array($status,['current','former','unspecified'],true)) $this->fail();
                    $jobs[$key]['statuses'][]=$status;$jobs[$key]['status']=$status;continue;
                }
                $pair=(string)($p['X-C2V-PAIR'] ?? 'v1');
                if (! preg_match('/^[a-zA-Z0-9-]+$/D',$pair)) $this->fail();
                $field=$name==='ORG' ? 'company' : 'title';
                if (isset($jobs[$key]['variants'][$pair][$field])) $this->fail();
                $jobs[$key]['variants'][$pair][$field]=$this->text($name==='ORG' ? ($p->getParts()[0] ?? '') : $p);
                $jobs[$key]['metadata'][$pair][$name]=['pair'=>isset($p['X-C2V-PAIR']),'alt'=>(string)($p['ALTID'] ?? '')];
                $language=(string)($p['LANGUAGE'] ?? '');
                if ($language) {
                    if (strlen($language)>64 || (isset($jobs[$key]['variants'][$pair]['language']) && $jobs[$key]['variants'][$pair]['language']!==$language)) $this->fail();
                    $jobs[$key]['variants'][$pair]['language']=$language;
                }
                $alt=(string)($p['ALTID'] ?? '');
                if ($alt) {
                    $altkey=$name.':'.$alt;
                    if (isset($altids[$altkey]) && $altids[$altkey]!==$key) $this->fail();
                    $altids[$altkey]=$key;$jobs[$key]['links'][$name][$alt]=true;
                }
            } elseif ($name==='ADR') {
                $parts=$p->getParts();
                foreach ($parts as $part) if (! is_string($part) || mb_strlen($part)>255) $this->fail();
                $alt=(string)($p['ALTID'] ?? '');$language=(string)($p['LANGUAGE'] ?? '');
                if (strlen($language)>64 || strlen($alt)>255) $this->fail();
                $addresses[]=['parts'=>$parts,'alternative_group'=>$alt ?: null,'language'=>$language ?: null];
            } elseif ($name==='TEL') {
                $phones[]=['group'=>$group,'value'=>$this->text($p)];
                if ($group) $links[$group]=($links[$group] ?? 0)+1;
            } elseif ($name==='X-WECHAT') $methods[]=['service'=>'wechat','value'=>$this->text($p),'phone'=>null];
            elseif ($name==='X-SOCIALPROFILE') {
                $service=strtolower((string)($p['TYPE'] ?? ''));
                if (! in_array($service,['linkedin','whatsapp'],true)) continue;
                $ref=(string)($p['X-C2V-PHONE'] ?? '');
                if ($ref && $service!=='whatsapp') $this->fail();
                $methods[]=['service'=>$service,'value'=>$this->text($p),'phone'=>strtolower($ref) ?: null];
            }
        }
        foreach ($methods as $method) if ($method['phone'] && ($links[$method['phone']] ?? 0)!==1) $this->fail();
        foreach ($jobs as &$job) {
            if (count($job['statuses'])>1 || ! $job['variants']) $this->fail();
            foreach ($job['links'] ?? [] as $alts) if (count($alts)>1) $this->fail();
            if (count($job['variants'])>1 && empty($job['links'])) $this->fail();
            if (count($job['variants'])>1) {
                $properties=[];
                foreach ($job['metadata'] as $pair) foreach ($pair as $name=>$meta) {
                    if (! $meta['pair']) $this->fail();
                    $properties[$name][]=$meta['alt'];
                }
                foreach ($properties as $alts) if (count($alts)>1 && (in_array('',$alts,true) || count(array_unique($alts))!==1)) $this->fail();
            }
            $job['variants']=array_values($job['variants']);
            foreach ($job['variants'] as &$variant) $variant+=['company'=>null,'title'=>null,'status'=>$job['status']];
            unset($variant,$job['statuses'],$job['links'],$job['metadata']);
        }
        unset($job);
        return ['structured'=>$structured,'jobs'=>array_values($jobs),'addresses'=>$addresses,'methods'=>$methods,'phones'=>$phones];
    }
}
