package com.iqappsgroup.kickole.billing;

import android.app.Activity;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
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
import com.android.billingclient.api.QueryPurchasesParams;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Google Play Billing (non-consumable one-time) for Kickolé Launch Collection.
 * Never logs purchase tokens or account credentials.
 */
@CapacitorPlugin(name = "KickoleBilling")
public class KickoleBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private static final String PRODUCT_ID = "kickole_launch_collection";

    private BillingClient billingClient;
    private ProductDetails launchProduct;
    private final AtomicBoolean purchaseInFlight = new AtomicBoolean(false);
    private PluginCall pendingPurchaseCall;

    @Override
    public void load() {
        PendingPurchasesParams pending = PendingPurchasesParams.newBuilder()
            .enableOneTimeProducts()
            .build();
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(pending)
            .build();
        startConnection(null);
    }

    private void startConnection(@Nullable Runnable onReady) {
        if (billingClient.isReady()) {
            if (onReady != null) onReady.run();
            return;
        }
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult billingResult) {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK && onReady != null) {
                    onReady.run();
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                // Will reconnect on next call.
            }
        });
    }

    @PluginMethod
    public void getLaunchProduct(PluginCall call) {
        startConnection(() -> queryProduct(call));
    }

    private void queryProduct(PluginCall call) {
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
        billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsList) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK
                || productDetailsList == null
                || productDetailsList.isEmpty()) {
                call.resolve(null);
                return;
            }
            launchProduct = productDetailsList.get(0);
            ProductDetails.OneTimePurchaseOfferDetails offer = launchProduct.getOneTimePurchaseOfferDetails();
            JSObject product = new JSObject();
            product.put("productId", launchProduct.getProductId());
            product.put("title", launchProduct.getName());
            product.put("description", launchProduct.getDescription());
            if (offer != null) {
                product.put("priceString", offer.getFormattedPrice());
                product.put("priceMicros", offer.getPriceAmountMicros());
                product.put("currencyCode", offer.getPriceCurrencyCode());
            } else {
                product.put("priceString", "");
                product.put("priceMicros", 0);
                product.put("currencyCode", "");
            }
            call.resolve(product);
        });
    }

    @PluginMethod
    public void purchaseLaunchCollection(PluginCall call) {
        if (!purchaseInFlight.compareAndSet(false, true)) {
            call.resolve(result("busy", false, null, "Purchase already in progress."));
            return;
        }
        pendingPurchaseCall = call;
        startConnection(() -> {
            if (launchProduct == null) {
                queryProductThenPurchase(call);
            } else {
                launchBillingFlow(call);
            }
        });
    }

    private void queryProductThenPurchase(PluginCall call) {
        List<QueryProductDetailsParams.Product> productList = new ArrayList<>();
        productList.add(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(PRODUCT_ID)
                .setProductType(BillingClient.ProductType.INAPP)
                .build()
        );
        billingClient.queryProductDetailsAsync(
            QueryProductDetailsParams.newBuilder().setProductList(productList).build(),
            (billingResult, productDetailsList) -> {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK
                    || productDetailsList == null
                    || productDetailsList.isEmpty()) {
                    purchaseInFlight.set(false);
                    pendingPurchaseCall = null;
                    call.resolve(result("unavailable", false, null, "Product is not available in Play Console for this build."));
                    return;
                }
                launchProduct = productDetailsList.get(0);
                launchBillingFlow(call);
            }
        );
    }

    private void launchBillingFlow(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || launchProduct == null) {
            purchaseInFlight.set(false);
            pendingPurchaseCall = null;
            call.resolve(result("failed", false, null, "Purchase could not be started."));
            return;
        }
        List<BillingFlowParams.ProductDetailsParams> paramsList = new ArrayList<>();
        paramsList.add(
            BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(launchProduct)
                .build()
        );
        BillingFlowParams flowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(paramsList)
            .build();
        BillingResult result = billingClient.launchBillingFlow(activity, flowParams);
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            purchaseInFlight.set(false);
            pendingPurchaseCall = null;
            call.resolve(result("failed", false, null, "Purchase could not be started."));
        }
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult billingResult, @Nullable List<Purchase> purchases) {
        PluginCall call = pendingPurchaseCall;
        pendingPurchaseCall = null;
        purchaseInFlight.set(false);

        int code = billingResult.getResponseCode();
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            if (call != null) call.resolve(result("cancelled", false, null, "Purchase cancelled."));
            return;
        }
        if (code != BillingClient.BillingResponseCode.OK || purchases == null) {
            if (call != null) call.resolve(result("failed", false, null, "Purchase could not be completed."));
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
            notifyEntitlement(true, ref);
        }

        if (call == null) return;
        if (unlocked) {
            call.resolve(result("purchased", true, ref, null));
        } else if (pendingOnly) {
            call.resolve(result("pending", false, null, "Purchase is pending. Content unlocks after Google Play confirms payment."));
        } else {
            call.resolve(result("failed", false, null, "Purchase could not be completed."));
        }
    }

    @PluginMethod
    public void restorePurchases(PluginCall call) {
        startConnection(() -> queryOwned(call, true));
    }

    @PluginMethod
    public void refreshEntitlements(PluginCall call) {
        startConnection(() -> queryOwned(call, false));
    }

    private void queryOwned(PluginCall call, boolean isRestore) {
        billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
            (billingResult, purchases) -> {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    if (isRestore) {
                        call.resolve(result("failed", false, null, "Could not restore purchases right now."));
                    } else {
                        JSObject out = new JSObject();
                        out.put("owned", false);
                        out.put("source", "google");
                        out.put("verifiedAt", System.currentTimeMillis());
                        out.put("transactionRef", JSObject.NULL);
                        call.resolve(out);
                    }
                    return;
                }
                boolean owned = false;
                String ref = null;
                for (Purchase purchase : purchases) {
                    if (!purchase.getProducts().contains(PRODUCT_ID)) continue;
                    if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) continue;
                    if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
                    owned = true;
                    ref = transactionRef(purchase);
                    acknowledge(purchase);
                }
                if (owned) notifyEntitlement(true, ref);
                if (isRestore) {
                    call.resolve(result(
                        "restored",
                        owned,
                        ref,
                        owned
                            ? "Launch Collection restored for this Google account."
                            : "No Launch Collection purchase found for this Google account."
                    ));
                } else {
                    JSObject out = new JSObject();
                    out.put("owned", owned);
                    out.put("source", "google");
                    out.put("verifiedAt", System.currentTimeMillis());
                    out.put("transactionRef", ref != null ? ref : JSObject.NULL);
                    call.resolve(out);
                }
            }
        );
    }

    private void acknowledge(Purchase purchase) {
        if (purchase.isAcknowledged()) return;
        AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.getPurchaseToken())
            .build();
        billingClient.acknowledgePurchase(params, billingResult -> {
            // Retry path: next restore/refresh will acknowledge again if needed.
            // Never consume this non-consumable product.
        });
    }

    /** Opaque non-secret reference — never the raw purchase token. */
    private String transactionRef(Purchase purchase) {
        String orderId = purchase.getOrderId();
        if (orderId == null || orderId.isEmpty()) {
            return "google:ok";
        }
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

    private JSObject result(String outcome, boolean owned, @Nullable String ref, @Nullable String message) {
        JSObject out = new JSObject();
        out.put("outcome", outcome);
        out.put("owned", owned);
        out.put("source", owned ? "google" : "none");
        out.put("verifiedAt", System.currentTimeMillis());
        out.put("transactionRef", ref != null ? ref : JSObject.NULL);
        if (message != null) out.put("message", message);
        return out;
    }
}
