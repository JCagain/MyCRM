<?php
require '/var/www/html/vendor/autoload.php';
$card = Sabre\VObject\Reader::read(stream_get_contents(STDIN));
$rows = [];
foreach ($card->children() as $property) {
    if (!$property instanceof Sabre\VObject\Property) continue;
    $params = [];
    foreach ($property->parameters() as $param) $params[$param->name] = (string)$param;
    $rows[] = ['name'=>$property->name,'group'=>$property->group,'params'=>$params,'parts'=>$property->getParts()];
}
echo json_encode(['version'=>Composer\InstalledVersions::getPrettyVersion('sabre/vobject'),'rows'=>$rows], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
