<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up()
    {
        Schema::table('occupations', function (Blueprint $t) {
            $t->unsignedInteger('company_id')->nullable()->change();
            $t->string('title')->nullable()->change();
            $t->string('status', 16)->nullable();
            $t->unsignedInteger('position')->default(0);
            $t->string('legacy_key')->nullable()->unique();
        });
        DB::table('occupations')->where('currently_works_here', 1)->update(['status'=>'current']);
        DB::table('occupations')->where('currently_works_here', 0)->update(['status'=>'former']);
        DB::table('occupations')->whereNull('status')->update(['status'=>'unspecified', 'currently_works_here'=>true]);
        Schema::create('job_variants', function (Blueprint $t) {
            $t->increments('id');
            $t->unsignedInteger('occupation_id');
            $t->string('company')->nullable();
            $t->string('title')->nullable();
            $t->string('language', 64)->nullable();
            $t->unsignedInteger('position')->default(0);
            $t->foreign('occupation_id')->references('id')->on('occupations')->onDelete('cascade');
        });
        Schema::create('company_aliases', function (Blueprint $t) {
            $t->increments('id');
            $t->unsignedInteger('account_id');
            $t->unsignedInteger('company_id');
            $t->string('name');
            $t->string('name_hash', 64)->index();
            $t->foreign('account_id')->references('id')->on('accounts')->onDelete('cascade');
            $t->foreign('company_id')->references('id')->on('companies')->onDelete('cascade');
            $t->unique(['company_id','name_hash']);
        });
        Schema::create('tag_categories', function (Blueprint $t) {
            $t->increments('id');
            $t->unsignedInteger('account_id');
            $t->string('name');
            $t->foreign('account_id')->references('id')->on('accounts')->onDelete('cascade');
        });
        Schema::table('tags', function (Blueprint $t) {
            $t->unsignedInteger('category_id')->nullable();
            $t->foreign('category_id')->references('id')->on('tag_categories')->onDelete('set null');
        });
        Schema::create('rating_levels', function (Blueprint $t) {
            $t->increments('id');
            $t->unsignedInteger('account_id');
            $t->string('dimension', 16);
            $t->string('name');
            $t->unsignedInteger('position');
            $t->string('seed_key')->nullable();
            $t->unique(['account_id','dimension','seed_key']);
            $t->foreign('account_id')->references('id')->on('accounts')->onDelete('cascade');
        });
        Schema::table('contacts', function (Blueprint $t) {
            foreach (['primary_occupation_id','primary_variant_id','closeness_id','importance_id'] as $name) $t->unsignedInteger($name)->nullable();
            $t->foreign('closeness_id')->references('id')->on('rating_levels')->onDelete('set null');
            $t->foreign('importance_id')->references('id')->on('rating_levels')->onDelete('set null');
        });
        Schema::table('addresses', function (Blueprint $t) {
            $t->string('alternative_group', 64)->nullable()->index();
            $t->string('language', 64)->nullable();
            $t->string('po_box')->nullable();
            $t->string('extended')->nullable();
            $t->string('printed_country')->nullable();
        });
        Schema::table('contact_fields', function (Blueprint $t) {
            $t->unsignedInteger('phone_id')->nullable()->index();
            $t->foreign('phone_id')->references('id')->on('contact_fields')->onDelete('set null');
        });
        app(\App\Services\Organization\Backfill::class)->execute();
    }

    // Rollback uses a matching database/storage backup; it must not discard new data.
    public function down() { throw new \RuntimeException('Restore the pre-upgrade backup to roll back organization data.'); }
};
