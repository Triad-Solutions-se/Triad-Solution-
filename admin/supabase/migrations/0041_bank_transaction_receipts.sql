-- Kvitto / leverantörsfaktura på banktransaktioner.
--
-- Bankdatan via PSD2 har inga bilagor: kvitton som fästs i Lunar-appen når
-- aldrig portalen. I stället bifogas filen på Ekonomi-sidan, laddas upp till
-- 'finance'-bucketen (bank/<tid>_<filnamn>) och sökvägen sparas i receipt_path.
--
-- Bara bokförda rader (BOOK) kan få en fil. Reserverade (PDNG) raderas och
-- skapas om vid varje synk, så en fil där skulle försvinna. Synkens upsert av
-- bokförda rader skickar inte receipt_path och skriver därför inte över den.
--
-- Medlemmar får ändra just receipt_path på bokförda rader, inget annat. Övriga
-- kolumner skrivs fortfarande bara av servern (service role).

alter table public.bank_transactions
  add column if not exists receipt_path text;

-- Kolumnbehörighet: revoke på tabellnivå tar även bort kolumngrants, så
-- ordningen gör filen säker att köra om.
revoke update on public.bank_transactions from anon, authenticated;
grant update (receipt_path) on public.bank_transactions to authenticated;

drop policy if exists bank_transactions_receipt_update on public.bank_transactions;
create policy bank_transactions_receipt_update on public.bank_transactions
  for update
  using (public.is_member() and status = 'BOOK')
  with check (public.is_member() and status = 'BOOK');
