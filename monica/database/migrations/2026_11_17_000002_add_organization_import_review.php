<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up() {
        Schema::create('organization_import_reviews',function (Blueprint $t) {
            $t->uuid('id')->primary();$t->unsignedInteger('account_id');$t->unsignedInteger('user_id');$t->longText('payload');$t->timestamp('expires_at');
            $t->foreign('account_id')->references('id')->on('accounts')->onDelete('cascade');
            $t->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        });
        Schema::table('import_job_reports',function (Blueprint $t) { $t->uuid('organization_review_id')->nullable(); });
    }
    public function down() { throw new RuntimeException('Restore the pre-upgrade backup.'); }
};
