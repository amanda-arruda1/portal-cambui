import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_users_papel" ADD VALUE 'setor_licitacoes';
  ALTER TYPE "public"."enum_users_papel" ADD VALUE 'leitor_licitacoes';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ALTER COLUMN "papel" SET DATA TYPE text;
  ALTER TABLE "users" ALTER COLUMN "papel" SET DEFAULT 'editor'::text;
  DROP TYPE "public"."enum_users_papel";
  CREATE TYPE "public"."enum_users_papel" AS ENUM('administrador', 'editor');
  ALTER TABLE "users" ALTER COLUMN "papel" SET DEFAULT 'editor'::"public"."enum_users_papel";
  ALTER TABLE "users" ALTER COLUMN "papel" SET DATA TYPE "public"."enum_users_papel" USING "papel"::"public"."enum_users_papel";`)
}
