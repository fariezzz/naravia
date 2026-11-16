import type { PoolClient } from 'pg';
import { newId } from './ids';
import { hashPassword } from './password';

// Membuat akun beserta persona bawaannya dalam satu transaksi milik pemanggil
export async function insertUserRecords(
  client: PoolClient,
  params: { email: string; password: string; displayName: string; role: 'user' | 'admin'; dailyTokenBudget?: number | null }
) {
  const userId = newId('user');
  const passwordHash = await hashPassword(params.password);

  await client.query(
    `INSERT INTO users (id, email, password_hash, display_name, role, daily_token_budget)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, params.email, passwordHash, params.displayName, params.role, params.dailyTokenBudget ?? null]
  );

  await client.query(
    `INSERT INTO user_personas (id, user_id, display_name, is_default) VALUES ($1, $2, $3, 1)`,
    [newId('persona'), userId, params.displayName]
  );

  return userId;
}
