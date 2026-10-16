import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_papel" AS ENUM('administrador', 'editor');
  ALTER TABLE "users" ADD COLUMN "papel" "enum_users_papel" DEFAULT 'editor' NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" DROP COLUMN "papel";
  DROP TYPE "public"."enum_users_papel";`)
}
