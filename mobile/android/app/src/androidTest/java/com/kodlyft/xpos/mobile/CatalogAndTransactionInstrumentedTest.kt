package com.kodlyft.xpos.mobile

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.kodlyft.xpos.mobile.catalog.CatalogRepository
import com.kodlyft.xpos.mobile.catalog.Item
import com.kodlyft.xpos.mobile.db.CatalogScope
import com.kodlyft.xpos.mobile.db.SchemaChangeBlockedException
import com.kodlyft.xpos.mobile.db.SchemaSync
import com.kodlyft.xpos.mobile.db.XposDb
import com.kodlyft.xpos.mobile.sync.OutboxProcessor
import com.kodlyft.xpos.mobile.txn.SampleLine
import com.kodlyft.xpos.mobile.txn.SampleSale
import com.kodlyft.xpos.mobile.txn.TransactionRepository
import com.kodlyft.xpos.mobile.txn.TxnConflictException
import com.kodlyft.xpos.mobile.txn.TxnWriteException
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented (emulator/device) tests. NOT RUN in the foundation milestone: no JDK/Android SDK was available
 * where this was written. They mirror the host SQLite tests (mobile/tests/*.spec.ts).
 */
@RunWith(AndroidJUnit4::class)
class CatalogAndTransactionInstrumentedTest {
    private lateinit var ctx: Context
    private lateinit var db: XposDb
    private lateinit var catalog: CatalogRepository
    private lateinit var txns: TransactionRepository
    private val scope = CatalogScope("real:t", "https://shop.example.com", "Acme", "Stores", "Standard Selling", "PKR", 2, null, 0)

    @Before fun setUp() {
        ctx = ApplicationProvider.getApplicationContext()
        db = XposDb(ctx, null, XposDb.loadSchema(ctx)) // in-memory
        catalog = CatalogRepository(db)
        txns = TransactionRepository(db)
    }
    @After fun tearDown() = db.close()

    /** Plain test items: unique codes and names, one barcode each, every 4th is a variant with a Colour attribute. */
    private fun items(n: Int, prefix: String = "A") = (1..n).map {
        Item("$prefix-%05d".format(it), if (it % 4 == 0) "TPL-$prefix" else null, "Item $prefix $it", "Group", "Nos", 1000L + it, null,
            if (it % 4 == 0) mapOf("Colour" to "Red") else emptyMap(), listOf("2000000%06d".format(it)))
    }

    private suspend fun seed(n: Int) {
        catalog.createScope(scope)
        val g = catalog.beginGeneration(scope.scopeId)
        items(n).chunked(500).forEach { catalog.putBatch(scope.scopeId, g, it) }
        catalog.activate(scope.scopeId, g, n)
    }

    @Test fun freshOpenCreatesTheSchemaFromTheModels() {
        assertEquals(true, db.lastSync?.changed)
        assertTrue(db.lastSync!!.createdTables.contains("item"))
    }

    @Test fun pagingIsStableWithoutGapsOrDuplicates() = runBlocking {
        seed(3000)
        val seen = ArrayList<String>(); var after: String? = null
        do { val p = catalog.page(scope.scopeId, after, 100, null); seen += p.items.map { it.itemCode }; after = p.next } while (after != null)
        assertEquals(3000, seen.size); assertEquals(3000, seen.toSet().size)
    }

    @Test fun barcodeLookupAndPrefixSearch() = runBlocking {
        seed(3000)
        val first = items(1).first()
        assertEquals(listOf(first.itemCode), catalog.lookupBarcode(scope.scopeId, first.barcodes[0]).matches.map { it.itemCode })
        assertTrue(catalog.search(scope.scopeId, first.itemCode, null, 50).items.any { it.itemCode == first.itemCode })
        assertEquals(0, catalog.search(scope.scopeId, "   ", null, 50).items.size)
    }

    @Test fun stagingInvisibleUntilActivateAndCountMismatchKeepsOldCatalog() = runBlocking {
        seed(100)
        val g2 = catalog.beginGeneration(scope.scopeId)
        catalog.putBatch(scope.scopeId, g2, items(50, "B"))
        assertEquals(100, catalog.stats(scope.scopeId, null).items)
        try { catalog.activate(scope.scopeId, g2, 51); fail("must refuse a count mismatch") } catch (e: IllegalStateException) { /* expected */ }
        assertEquals(100, catalog.stats(scope.scopeId, null).items)
    }

    private fun sale(id: String = "smp-1", qty: Long = 2000) = SampleSale(id, scope.scopeId, "KWD", 3, listOf(SampleLine("A", "Apple", 1250, qty), SampleLine("B", "Bean", 333, 1500)))

    @Test fun sampleCommitIsAtomicIdempotentAndConflictChecked() = runBlocking {
        assertEquals("created", txns.commitSample(sale()).status)
        assertEquals("duplicate", txns.commitSample(sale()).status)
        try { txns.commitSample(sale(qty = 1000)); fail("same id, different contents must be rejected") } catch (e: TxnConflictException) { /* expected */ }
        assertEquals(mapOf("blocked" to 1), txns.outboxCounts())
    }

    @Test fun failureAfterEachStageRollsEverythingBack() = runBlocking {
        for (stage in listOf("after-sale", "after-receipt", "after-outbox")) {
            val t = TransactionRepository(db, faultHook = { if (it == stage) throw RuntimeException("disk full") })
            try { t.commitSample(sale("smp-$stage")); fail("must fail at $stage") } catch (e: TxnWriteException) { /* expected */ }
            assertNull(db.txn().txn("smp-$stage")); assertEquals(emptyMap<String, Int>(), txns.outboxCounts())
        }
    }

    @Test fun sampleCommandsAreNeverClaimableAndTheDatabaseForbidsPendingSamples() = runBlocking {
        txns.commitSample(sale())
        assertNull(OutboxProcessor(db).claimNext())
        try { db.db.execSQL("UPDATE outbox SET state='pending'"); fail("database CHECK must forbid a pending SAMPLE row") } catch (e: Exception) { assertTrue(e.message!!.contains("CHECK", true)) }
    }

    /** The user installs the latest version: an older database gets the new field, rows are kept. */
    @Test fun upgradeFromAnOlderInstallAddsTheFieldAndKeepsRows() {
        val doc = XposDb.loadSchema(ctx)
        val old = XposDb(ctx, "schema-upgrade-test.db", doc.copy(models = doc.models.filter { it.table != "item" }))
        ctx.deleteDatabase("schema-upgrade-test.db")
        val raw = old.db
        raw.execSQL(doc.models.first { it.table == "item" }.createSql.replace("brand TEXT,\n  ", "")) // an install from before `brand` existed
        raw.execSQL("INSERT INTO item (scope_id,gen,item_code,name,name_norm,code_norm,item_group,uom,price_minor) VALUES ('s',1,'A','Apple','apple','a','G','Nos',100)")
        val report = SchemaSync(raw, doc).sync()
        assertTrue(report.addedColumns.contains("item.brand"))
        raw.rawQuery("SELECT price_minor, brand FROM item WHERE item_code = 'A'", null).use { c -> assertTrue(c.moveToFirst()); assertEquals(100L, c.getLong(0)); assertTrue(c.isNull(1)) }
        old.close(); ctx.deleteDatabase("schema-upgrade-test.db")
    }

    @Test fun unsafeChangesAreRefusedAndNothingIsChanged() {
        val doc = XposDb.loadSchema(ctx)
        val bad = doc.copy(models = doc.models.map { m -> if (m.table == "device_meta") m.copy(columns = m.columns.map { if (it.name == "v") it.copy(type = "INTEGER") else it }) else m }, fingerprint = "changed")
        try { SchemaSync(db.db, bad).sync(); fail("type change must be refused") } catch (e: SchemaChangeBlockedException) { assertTrue(e.blocked.any { it.contains("device_meta.v: type changed") }) }
        assertNotNull(db.catalog()) // database still usable
    }
}
