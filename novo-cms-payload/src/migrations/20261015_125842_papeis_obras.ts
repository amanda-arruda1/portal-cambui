import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_users_papel" ADD VALUE 'setor_obras' BEFORE 'servico_avisos_portal';
  ALTER TYPE "public"."enum_users_papel" ADD VALUE 'leitor_obras' BEFORE 'servico_avisos_portal';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ALTER COLUMN "papel" SET DATA TYPE text;
  ALTER TABLE "users" ALTER COLUMN "papel" SET DEFAULT 'editor'::text;
  DROP TYPE "public"."enum_users_papel";
  CREATE TYPE "public"."enum_users_papel" AS ENUM('administrador', 'editor', 'setor_licitacoes', 'leitor_licitacoes', 'servico_avisos_portal', 'servico_avisos_entrega');
  ALTER TABLE "users" ALTER COLUMN "papel" SET DEFAULT 'editor'::"public"."enum_users_papel";
  ALTER TABLE "users" ALTER COLUMN "papel" SET DATA TYPE "public"."enum_users_papel" USING "papel"::"public"."enum_users_papel";`)
}
