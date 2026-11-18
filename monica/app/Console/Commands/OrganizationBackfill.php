<?php

namespace App\Console\Commands;

use App\Services\Organization\Backfill;
use Illuminate\Console\Command;

class OrganizationBackfill extends Command
{
    protected $signature = 'organization:backfill';
    protected $description = 'Resume the idempotent organization backfill after migrations';

    public function handle(Backfill $backfill): int
    {
        $backfill->execute();
        $this->info('Organization backfill completed.');

        return 0;
    }
}
