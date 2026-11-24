package com.horadotreino.app;

import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.widget.FrameLayout;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * Tela cheia de vídeo no app Android.
 *
 * O Capacitor, por padrão, cancela qualquer pedido de tela cheia de vídeo (YouTube e <video>).
 * Aqui assumimos esse pedido: o vídeo ocupa a tela toda, as barras do sistema somem,
 * o celular gira para paisagem e o botão "voltar" sai da tela cheia.
 */
public class MainActivity extends BridgeActivity {

  private View fullscreenView;
  private WebChromeClient.CustomViewCallback fullscreenCallback;
  private int previousOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
  private OnBackPressedCallback exitFullscreenOnBack;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // "Voltar" durante a tela cheia: só sai da tela cheia (não fecha a página).
    exitFullscreenOnBack = new OnBackPressedCallback(false) {
      @Override
      public void handleOnBackPressed() {
        exitFullscreen();
      }
    };
    getOnBackPressedDispatcher().addCallback(this, exitFullscreenOnBack);

    if (bridge != null && bridge.getWebView() != null) {
      bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(bridge) {
        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
          enterFullscreen(view, callback);
        }

        @Override
        public void onHideCustomView() {
          exitFullscreen();
        }
      });
    }
  }

  private void enterFullscreen(View view, WebChromeClient.CustomViewCallback callback) {
    if (fullscreenView != null) {
      callback.onCustomViewHidden();
      return;
    }
    fullscreenView = view;
    fullscreenCallback = callback;

    view.setBackgroundColor(Color.BLACK);
    FrameLayout decor = (FrameLayout) getWindow().getDecorView();
    decor.addView(view, new FrameLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT
    ));

    WindowInsetsControllerCompat controller =
      WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    controller.hide(WindowInsetsCompat.Type.systemBars());
    controller.setSystemBarsBehavior(
      WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    );

    previousOrientation = getRequestedOrientation();
    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);

    exitFullscreenOnBack.setEnabled(true);
  }

  private void exitFullscreen() {
    if (fullscreenView == null) return;

    FrameLayout decor = (FrameLayout) getWindow().getDecorView();
    decor.removeView(fullscreenView);

    WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
      .show(WindowInsetsCompat.Type.systemBars());
    setRequestedOrientation(previousOrientation);

    WebChromeClient.CustomViewCallback callback = fullscreenCallback;
    fullscreenView = null;
    fullscreenCallback = null;
    exitFullscreenOnBack.setEnabled(false);

    if (callback != null) callback.onCustomViewHidden();
  }
}
