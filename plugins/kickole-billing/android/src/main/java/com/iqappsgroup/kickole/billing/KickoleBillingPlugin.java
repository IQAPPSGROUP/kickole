package com.iqappsgroup.kickole.billing;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryProductDetailsResult;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Google Play Billing (non-consumable one-time) for Kickolé Launch Collection.
 * Play Billing Library 9.x: pending purchases take {@link PendingPurchasesParams},
 * product queries return {@link QueryProductDetailsResult}, and the client opts into
 * automatic service reconnection. Purchase history is not queried — active and pending
 * one-time purchases come from {@code queryPurchasesAsync} only.
 * Never logs purchase tokens, offer tokens or account credentials.
 */
@CapacitorPlugin(name = "KickoleBilling")
public class KickoleBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private static final String PRODUCT_ID = "kickole_launch_collection";
    private static final long CONNECTION_TIMEOUT_MS = 15_000L;
    private static final long ACK_RETRY_DELAY_MS = 5_000L;
    private static final String UNAVAILABLE = "Google Play billing is unavailable. Try again.";

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final List<Runnable> onConnected = new ArrayList<>();
    private final List<Runnable> onFailed = new ArrayList<>();

    private BillingClient billingClient;
    private ProductDetails launchProduct;
    @Nullable private String launchOfferToken;
    @Nullable private ProductDetails packProduct;
    @Nullable private String packOfferToken;
    @Nullable private String packProductId;
    private final AtomicBoolean purchaseInFlight = new AtomicBoolean(false);
    private PluginCall pendingPurchaseCall;
    private boolean connecting = false;
    private int connectionGeneration = 0;
    /** Bumped when a purchase is delivered so an older query cannot revoke it. */
    private int purchaseEpoch = 0;
    @Nullable private Runnable connectionTimeout;

    @Override
    public void load() {
        PendingPurchasesParams pending = PendingPurchasesParams.newBuilder()
            .enableOneTimeProducts()
            .build();
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(pending)
            .enableAutoServiceReconnection()
            .build();
        whenReady(() -> { /* warm the connection; callers queue if this is still in flight */ }, () -> { });
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        whenReady(this::queryAndNotify, () -> { /* keep the cached entitlement; do not report not-owned */ });
    }

    private void whenReady(@NonNull Runnable ready, @NonNull Runnable failed) {
        mainHandler.post(() -> {
            if (billingClient.isReady()) {
                ready.run();
                return;
            }
            onConnected.add(ready);
            onFailed.add(failed);
            if (connecting) return;
            final int generation = ++connectionGeneration;
            connecting = true;
            if (connectionTimeout != null) mainHandler.removeCallbacks(connectionTimeout);
            connectionTimeout = () -> finishConnection(false, generation);
            mainHandler.postDelayed(connectionTimeout, CONNECTION_TIMEOUT_MS);
            billingClient.startConnection(new BillingClientStateListener() {
                @Override
                public void onBillingSetupFinished(@NonNull BillingResult billingResult) {
                    boolean ok = billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK;
                    mainHandler.post(() -> finishConnection(ok, generation));
                }

                @Override
                public void onBillingServiceDisconnected() {
                    mainHandler.post(() -> {
                        if (generation == connectionGeneration && connecting) {
                            finishConnection(false, generation);
                        }
                    });
                }
            });
        });
    }

    private void finishConnection(boolean ok, int generation) {
        if (generation != connectionGeneration) return;
        connectionGeneration++;
        connecting = false;
        if (connectionTimeout != null) {
            mainHandler.removeCallbacks(connectionTimeout);
            connectionTimeout = null;
        }
        List<Runnable> next = new ArrayList<>(ok ? onConnected : onFailed);
        onConnected.clear();
        onFailed.clear();
        for (Runnable runnable : next) runnable.run();
    }

    @PluginMethod
    public void getLaunchProduct(PluginCall call) {
        whenReady(() -> queryProduct(call, false), () -> call.resolve(null));
    }

    private void queryProduct(PluginCall call, boolean thenPurchase) {
        List<QueryProductDetailsParams.Product> productList = new ArrayList<>();
        productList.add(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(PRODUCT_ID)
                .setProductType(BillingClient.ProductType.INAPP)
                .build()
        );
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(productList)
            .build();
        billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsResult) ->
            mainHandler.post(() -> handleProductResult(call, thenPurchase, billingResult, productDetailsResult))
        );
    }

    private void handleProductResult(
        PluginCall call,
        boolean thenPurchase,
        @NonNull BillingResult billingResult,
        @NonNull QueryProductDetailsResult productDetailsResult
    ) {
        List<ProductDetails> products = productDetailsResult.getProductDetailsList();
        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK
            || products == null
            || products.isEmpty()) {
            if (thenPurchase) failPurchase(call, "unavailable", "Product is not available in Play Console for this build.");
            else call.resolve(null);
            return;
        }
        rememberProduct(products.get(0));
        if (thenPurchase) launchBillingFlow(call);
        else call.resolve(productPayload(launchProduct));
    }

    private void rememberProduct(ProductDetails details) {
        launchProduct = details;
        ProductDetails.OneTimePurchaseOfferDetails offer = selectOffer(details);
        String token = offer != null ? offer.getOfferToken() : null;
        launchOfferToken = token == null || token.isEmpty() ? null : token;
    }

    @Nullable
    private ProductDetails.OneTimePurchaseOfferDetails selectOffer(ProductDetails details) {
        List<ProductDetails.OneTimePurchaseOfferDetails> offers = details.getOneTimePurchaseOfferDetailsList();
        if (offers != null) {
            for (ProductDetails.OneTimePurchaseOfferDetails offer : offers) {
                if (offer != null) return offer;
            }
        }
        return details.getOneTimePurchaseOfferDetails();
    }

    private JSObject productPayload(ProductDetails details) {
        ProductDetails.OneTimePurchaseOfferDetails offer = selectOffer(details);
        JSObject product = new JSObject();
        product.put("productId", details.getProductId());
        product.put("title", details.getName());
        product.put("description", details.getDescription());
        if (offer != null) {
            product.put("priceString", offer.getFormattedPrice());
            product.put("priceMicros", offer.getPriceAmountMicros());
            product.put("currencyCode", offer.getPriceCurrencyCode());
        } else {
            product.put("priceString", "");
            product.put("priceMicros", 0);
            product.put("currencyCode", "");
        }
        return product;
    }

    @PluginMethod
    public void purchaseLaunchCollection(PluginCall call) {
        if (!purchaseInFlight.compareAndSet(false, true)) {
            call.resolve(result("busy", false, "none", null, "Purchase already in progress."));
            return;
        }
        pendingPurchaseCall = call;
        whenReady(() -> {
            if (launchProduct == null) queryProduct(call, true);
            else launchBillingFlow(call);
        }, () -> failPurchase(call, "unavailable", UNAVAILABLE));
    }

    private void failPurchase(PluginCall call, String outcome, String message) {
        purchaseInFlight.set(false);
        if (pendingPurchaseCall == call) pendingPurchaseCall = null;
        call.resolve(result(outcome, false, "none", null, message));
    }

    private void launchBillingFlow(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || launchProduct == null) {
            failPurchase(call, "failed", "Purchase could not be started.");
            return;
        }
        BillingFlowParams.ProductDetailsParams.Builder productParams =
            BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(launchProduct);
        if (launchOfferToken != null) productParams.setOfferToken(launchOfferToken);
        List<BillingFlowParams.ProductDetailsParams> paramsList = new ArrayList<>();
        paramsList.add(productParams.build());
        BillingFlowParams flowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(paramsList)
            .build();
        BillingResult launched = billingClient.launchBillingFlow(activity, flowParams);
        if (launched.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            failPurchase(call, "failed", purchaseFailureMessage(launched));
        }
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult billingResult, @Nullable List<Purchase> purchases) {
        mainHandler.post(() -> deliverPurchaseUpdate(billingResult, purchases));
    }

    private void clearPackPurchase() {
        packProductId = null;
        packProduct = null;
        packOfferToken = null;
    }

    private void deliverPurchaseUpdate(@NonNull BillingResult billingResult, @Nullable List<Purchase> purchases) {
        PluginCall call = pendingPurchaseCall;
        pendingPurchaseCall = null;
        purchaseInFlight.set(false);
        final String buyingPack = packProductId;

        int code = billingResult.getResponseCode();
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            clearPackPurchase();
            if (call != null) {
                JSObject out = result("cancelled", false, "none", null, "Purchase cancelled.");
                if (buyingPack != null) out.put("productId", buyingPack);
                call.resolve(out);
            }
            return;
        }
        if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            if (buyingPack != null) {
                clearPackPurchase();
                if (call != null) {
                    JSObject out = result("already_owned", false, "google", null, null);
                    out.put("productId", buyingPack);
                    call.resolve(out);
                }
                return;
            }
            if (call != null) queryOwned(call, "already_owned");
            else queryAndNotify();
            return;
        }
        if (code != BillingClient.BillingResponseCode.OK || purchases == null) {
            clearPackPurchase();
            if (call != null) {
                JSObject out = result("failed", false, "none", null, purchaseFailureMessage(billingResult));
                if (buyingPack != null) out.put("productId", buyingPack);
                call.resolve(out);
            }
            return;
        }

        if (buyingPack != null) {
            boolean packUnlocked = false;
            boolean packPending = false;
            for (Purchase purchase : purchases) {
                if (!purchase.getProducts().contains(buyingPack)) continue;
                if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                    packPending = true;
                    continue;
                }
                if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
                packUnlocked = true;
                acknowledge(purchase);
            }
            clearPackPurchase();
            if (call != null && packUnlocked) {
                JSObject out = result("purchased", false, "google", null, null);
                out.put("productId", buyingPack);
                call.resolve(out);
            } else if (call != null && packPending) {
                JSObject out = result("pending", false, "none", null, "Purchase is pending. Content unlocks after Google Play confirms payment.");
                out.put("productId", buyingPack);
                call.resolve(out);
            } else if (call != null) {
                JSObject out = result("failed", false, "none", null, "Purchase could not be completed.");
                out.put("productId", buyingPack);
                call.resolve(out);
            }
            return;
        }

        boolean unlocked = false;
        String ref = null;
        boolean pendingOnly = false;
        for (Purchase purchase : purchases) {
            if (!purchase.getProducts().contains(PRODUCT_ID)) continue;
            if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                pendingOnly = true;
                continue;
            }
            if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
            unlocked = true;
            ref = transactionRef(purchase);
            acknowledge(purchase);
        }

        if (unlocked) {
            purchaseEpoch++;
            notifyEntitlement(true, ref);
        }
        if (call == null) return;
        if (unlocked) call.resolve(result("purchased", true, "google", ref, null));
        else if (pendingOnly) {
            call.resolve(result("pending", false, "none", null, "Purchase is pending. Content unlocks after Google Play confirms payment."));
        } else {
            call.resolve(result("failed", false, "none", null, "Purchase could not be completed."));
        }
    }

    private String purchaseFailureMessage(BillingResult billingResult) {
        int sub = billingResult.getOnPurchasesUpdatedSubResponseCode();
        if (sub == BillingClient.OnPurchasesUpdatedSubResponseCode.PAYMENT_DECLINED_DUE_TO_INSUFFICIENT_FUNDS) {
            return "Payment was declined. Check your payment method and try again.";
        }
        if (sub == BillingClient.OnPurchasesUpdatedSubResponseCode.USER_INELIGIBLE) {
            return "This account cannot buy the Launch Collection.";
        }
        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.BILLING_UNAVAILABLE
            || billingResult.getResponseCode() == BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE
            || billingResult.getResponseCode() == BillingClient.BillingResponseCode.SERVICE_DISCONNECTED) {
            return UNAVAILABLE;
        }
        return "Purchase could not be completed.";
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
        JSArray requested;
        try {
            requested = call.getArray("productIds");
        } catch (Exception error) {
            requested = null;
        }
        final JSArray ids = requested;
        whenReady(() -> queryPackProducts(call, ids), () -> {
            JSObject empty = new JSObject();
            empty.put("products", new JSArray());
            call.resolve(empty);
        });
    }

    private void queryPackProducts(PluginCall call, @Nullable JSArray ids) {
        List<QueryProductDetailsParams.Product> productList = new ArrayList<>();
        if (ids != null) {
            for (int i = 0; i < ids.length(); i++) {
                String id = ids.optString(i, "");
                if (id.isEmpty()) continue;
                productList.add(
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(id)
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build()
                );
            }
        }
        if (productList.isEmpty()) {
            JSObject empty = new JSObject();
            empty.put("products", new JSArray());
            call.resolve(empty);
            return;
        }
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(productList)
            .build();
        billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsResult) ->
            mainHandler.post(() -> {
                JSArray rows = new JSArray();
                List<ProductDetails> products = productDetailsResult.getProductDetailsList();
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK && products != null) {
                    for (ProductDetails details : products) {
                        ProductDetails.OneTimePurchaseOfferDetails offer = selectOffer(details);
                        if (offer == null || offer.getFormattedPrice() == null || offer.getFormattedPrice().isEmpty()) continue;
                        rows.put(productPayload(details));
                    }
                }
                JSObject out = new JSObject();
                out.put("products", rows);
                call.resolve(out);
            })
        );
    }

    @PluginMethod
    public void purchaseProduct(PluginCall call) {
        String id = call.getString("productId", "");
        if (id == null || id.isEmpty()) {
            JSObject missing = result("unavailable", false, "none", null, "Product is not available in Play Console for this build.");
            missing.put("productId", "");
            call.resolve(missing);
            return;
        }
        if (!purchaseInFlight.compareAndSet(false, true)) {
            JSObject busy = result("busy", false, "none", null, "Purchase already in progress.");
            busy.put("productId", id);
            call.resolve(busy);
            return;
        }
        pendingPurchaseCall = call;
        packProductId = id;
        whenReady(() -> queryOnePack(call, id), () -> {
            clearPackPurchase();
            failPurchase(call, "unavailable", UNAVAILABLE);
        });
    }

    private void queryOnePack(PluginCall call, String id) {
        List<QueryProductDetailsParams.Product> productList = new ArrayList<>();
        productList.add(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(id)
                .setProductType(BillingClient.ProductType.INAPP)
                .build()
        );
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(productList)
            .build();
        billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsResult) ->
            mainHandler.post(() -> {
                List<ProductDetails> products = productDetailsResult.getProductDetailsList();
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK
                    || products == null
                    || products.isEmpty()) {
                    packProductId = null;
                    failPurchase(call, "unavailable", "Product is not available in Play Console for this build.");
                    return;
                }
                packProduct = products.get(0);
                ProductDetails.OneTimePurchaseOfferDetails offer = selectOffer(packProduct);
                String token = offer != null ? offer.getOfferToken() : null;
                packOfferToken = token == null || token.isEmpty() ? null : token;
                launchPackFlow(call);
            })
        );
    }

    private void launchPackFlow(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || packProduct == null) {
            packProductId = null;
            failPurchase(call, "failed", "Purchase could not be started.");
            return;
        }
        BillingFlowParams.ProductDetailsParams.Builder productParams =
            BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(packProduct);
        if (packOfferToken != null) productParams.setOfferToken(packOfferToken);
        List<BillingFlowParams.ProductDetailsParams> paramsList = new ArrayList<>();
        paramsList.add(productParams.build());
        BillingFlowParams flowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(paramsList)
            .build();
        BillingResult launched = billingClient.launchBillingFlow(activity, flowParams);
        if (launched.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            packProductId = null;
            failPurchase(call, "failed", purchaseFailureMessage(launched));
        }
    }

    @PluginMethod
    public void ownedProductIds(PluginCall call) {
        whenReady(() -> billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
            (billingResult, purchases) -> mainHandler.post(() -> {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null) {
                    call.reject("Could not check purchases right now.", "billing_query_failed");
                    return;
                }
                JSArray ids = new JSArray();
                for (Purchase purchase : purchases) {
                    if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
                    acknowledge(purchase);
                    for (String id : purchase.getProducts()) ids.put(id);
                }
                JSObject out = new JSObject();
                out.put("productIds", ids);
                call.resolve(out);
            })
        ), () -> call.reject(UNAVAILABLE, "billing_unavailable"));
    }

    /** TestFlight is iOS-only. Play installs, including internal tracks, stay on real purchases. */
    @PluginMethod
    public void isSandboxReceipt(PluginCall call) {
        JSObject out = new JSObject();
        out.put("sandboxReceipt", false);
        call.resolve(out);
    }

    @PluginMethod
    public void restorePurchases(PluginCall call) {
        whenReady(
            () -> queryOwned(call, "restored"),
            () -> call.resolve(result("failed", false, "none", null, "Could not restore purchases right now."))
        );
    }

    @PluginMethod
    public void refreshEntitlements(PluginCall call) {
        whenReady(
            () -> queryOwned(call, null),
            () -> call.reject(UNAVAILABLE, "billing_unavailable")
        );
    }

    /** Resume path: push a definitive entitlement, and skip the push when Play did not answer. */
    private void queryAndNotify() {
        queryOwned(null, null);
    }

    /**
     * @param restoreOutcome {@code restored} or {@code already_owned} for a user-facing call;
     *                       null for a silent refresh / resume.
     */
    private void queryOwned(@Nullable PluginCall call, @Nullable String restoreOutcome) {
        final int epoch = purchaseEpoch;
        billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
            (billingResult, purchases) -> mainHandler.post(() -> {
                if (epoch != purchaseEpoch) {
                    // A purchase completed while this query was in flight. Do not report not-owned.
                    if (call == null) return;
                    if (restoreOutcome != null) {
                        call.resolve(result("failed", false, "none", null, "Could not confirm ownership right now."));
                    } else {
                        call.reject("Could not check purchases right now.", "billing_query_failed");
                    }
                    return;
                }
                handleOwnedResult(call, restoreOutcome, billingResult, purchases);
            })
        );
    }

    private void handleOwnedResult(
        @Nullable PluginCall call,
        @Nullable String restoreOutcome,
        @NonNull BillingResult billingResult,
        @Nullable List<Purchase> purchases
    ) {
        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null) {
            // Not a definitive "not owned". Never revoke on a transient Play error.
            if (call == null) return;
            if (restoreOutcome != null) {
                call.resolve(result("failed", false, "none", null, "Could not restore purchases right now."));
            } else {
                call.reject("Could not check purchases right now.", "billing_query_failed");
            }
            return;
        }

        boolean owned = false;
        boolean pending = false;
        boolean unknown = false;
        String ref = null;
        for (Purchase purchase : purchases) {
            if (!purchase.getProducts().contains(PRODUCT_ID)) continue;
            int state = purchase.getPurchaseState();
            if (state == Purchase.PurchaseState.PENDING) {
                pending = true;
                continue;
            }
            if (state != Purchase.PurchaseState.PURCHASED) {
                unknown = true;
                continue;
            }
            owned = true;
            ref = transactionRef(purchase);
            acknowledge(purchase);
        }

        if (owned) {
            notifyEntitlement(true, ref);
        } else if (!pending && !unknown) {
            notifyEntitlement(false, null);
        }

        if (call == null) return;
        if (restoreOutcome != null) {
            if (owned) {
                String message = "already_owned".equals(restoreOutcome)
                    ? "You already own the Launch Collection on this Google account."
                    : "Launch Collection restored for this Google account.";
                call.resolve(result(restoreOutcome, true, "google", ref, message));
            } else if (pending) {
                call.resolve(result("pending", false, "none", null, "Purchase is pending. Content unlocks after Google Play confirms payment."));
            } else if (unknown) {
                call.resolve(result("failed", false, "none", null, "Could not confirm ownership right now."));
            } else {
                call.resolve(result("restored", false, "google", null, "No Launch Collection purchase found for this Google account."));
            }
            return;
        }

        if ((pending || unknown) && !owned) {
            JSObject unresolved = new JSObject();
            unresolved.put("owned", false);
            unresolved.put("source", "none");
            unresolved.put("verifiedAt", 0);
            unresolved.put("transactionRef", JSObject.NULL);
            call.resolve(unresolved);
            return;
        }

        JSObject out = new JSObject();
        out.put("owned", owned);
        out.put("source", "google");
        out.put("verifiedAt", System.currentTimeMillis());
        out.put("transactionRef", ref != null ? ref : JSObject.NULL);
        call.resolve(out);
    }

    private void acknowledge(Purchase purchase) {
        if (purchase.isAcknowledged()) return;
        AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.getPurchaseToken())
            .build();
        billingClient.acknowledgePurchase(params, billingResult -> {
            if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) return;
            // One delayed retry. Resume and the next refresh acknowledge again if needed.
            // Never consume this non-consumable product, and never log the token.
            mainHandler.postDelayed(() -> {
                if (billingClient.isReady()) billingClient.acknowledgePurchase(params, ignored -> { });
            }, ACK_RETRY_DELAY_MS);
        });
    }

    /** Opaque non-secret reference — never the raw purchase token. */
    private String transactionRef(Purchase purchase) {
        String orderId = purchase.getOrderId();
        if (orderId == null || orderId.isEmpty()) return "google:ok";
        int n = orderId.length();
        String head = orderId.substring(0, Math.min(6, n));
        String tail = orderId.substring(Math.max(0, n - 4));
        return "google:" + head + "…" + tail;
    }

    private void notifyEntitlement(boolean owned, @Nullable String ref) {
        JSObject data = new JSObject();
        data.put("owned", owned);
        data.put("source", "google");
        data.put("verifiedAt", System.currentTimeMillis());
        data.put("transactionRef", ref != null ? ref : JSObject.NULL);
        notifyListeners("entitlementChanged", data);
    }

    private JSObject result(String outcome, boolean owned, String source, @Nullable String ref, @Nullable String message) {
        JSObject out = new JSObject();
        out.put("outcome", outcome);
        out.put("owned", owned);
        out.put("source", source);
        out.put("verifiedAt", System.currentTimeMillis());
        out.put("transactionRef", ref != null ? ref : JSObject.NULL);
        if (message != null) out.put("message", message);
        return out;
    }
}
