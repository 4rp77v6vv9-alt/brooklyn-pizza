package ru.brooklynpizza.magnitogorsk;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;

public class MainActivity extends Activity {
    private static final String HOME = "https://brooklyn-pizza-chennchef.amvera.io";
    private static final int FILE_CHOOSER = 9001;

    private WebView webView;
    private ProgressBar progress;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.rgb(14, 14, 14));
        window.setNavigationBarColor(Color.rgb(14, 14, 14));

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(14, 14, 14));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(14, 14, 14));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUserAgentString(settings.getUserAgentString() + " BrooklynPizzaAndroid/1.0");

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setVisibility(View.GONE);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme();
                String host = uri.getHost() == null ? "" : uri.getHost();

                if (scheme.equals("http") || scheme.equals("https")) {
                    if (host.endsWith("amvera.io") || host.endsWith("yandex.ru") || host.endsWith("yandex.net")) {
                        return false;
                    }
                    openExternal(uri);
                    return true;
                }

                if (scheme.equals("intent")) {
                    try {
                        Intent intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                        startActivity(intent);
                    } catch (Exception ignored) {}
                    return true;
                }

                openExternal(uri);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                CookieManager.getInstance().flush();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progress.setProgress(newProgress);
                progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = filePathCallback;
                try {
                    startActivityForResult(fileChooserParams.createIntent(), FILE_CHOOSER);
                    return true;
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
            }
        });

        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        root.addView(progress, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                6
        ));
        setContentView(root);

        String startUrl = HOME;
        Intent launchIntent = getIntent();
        if (launchIntent != null && launchIntent.getData() != null) {
            Uri data = launchIntent.getData();
            if ("brooklynpizza".equals(data.getScheme())) {
                String path = data.getPath();
                if (path != null && path.startsWith("/")) startUrl = HOME + path;
            }
        }

        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(startUrl);
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {}
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        Uri data = intent.getData();
        if (data != null && "brooklynpizza".equals(data.getScheme()) && webView != null) {
            String path = data.getPath();
            webView.loadUrl(HOME + (path == null ? "" : path));
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER && fileCallback != null) {
            Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            fileCallback.onReceiveValue(results);
            fileCallback = null;
        }
    }
}
