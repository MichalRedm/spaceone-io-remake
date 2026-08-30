#include "stdafx.h"
#include "Game.h"
#include "Screen.h"

#ifndef EMSCRIPTEN
#include <unistd.h>
#endif

#ifdef TARGET_OS_MAC
#include "MCGlut.h"
#include "Scene.h"
#endif

Screen g_Screen{0, 0};

namespace {
#ifdef EMSCRIPTEN
	Context *s_MainCtx = Context::FromCanvas("canvas");
#else
    Context *s_MainCtx = NULL;
#endif

};

static bool ImageInitRun = false;
static void ImageInit() {
    if (!ImageInitRun)
    ImageInitRun = true;
    else
    return;
    
    Context::AddAtlas("icons", "atlas/icons.json", "atlas/icons.png");
    Context::AddAtlas("lasers", "atlas/lasers.json", "atlas/lasers.png");
    Context::AddAtlas("ships", "atlas/ships.json", "atlas/ships.png");
    Context::AddAtlas("foods", "atlas/foods.json", "atlas/foods.png");
    Context::AddAtlas("particles", "atlas/particles.json", "atlas/particles.png");
    
    static Image image("img/BG.jpg");
}

void draw(){
	int32_t width, height;
	s_MainCtx->GetSize(&width, &height);
	
	if(width != g_Screen.width || height != g_Screen.height){
		g_Screen.width = width;
		g_Screen.height = height;
		g_Game.Rendering()->OnResize();
	}
    
    s_MainCtx->BeginFrame(g_Screen.width, g_Screen.height);
	
	s_MainCtx->ClearRect(0, 0, g_Screen.width, g_Screen.height);
	
	g_Game.Render(s_MainCtx);
    
    s_MainCtx->EndFrame();
}

void idle(){
	g_Game.Rendering()->OnIdle();
	g_Game.Cells()->OnIdle();
}

void check_maestro_ws()
{
	if(g_Game.Networking()->GetMaestroConnectionHandler().PollMaestroSocket())
	{
		//Socket returned
		Debug("Socket Returned");
	}
}

int main(){	
#ifdef TARGET_OS_MAC
    MCGlut* mcglut = MCGlut::getShared();
    mcglut->setInitCallback([](int w, int h){printf("init\n");});
    mcglut->setSurfaceChangedCallback([](int w, int h){printf("surfaceChanged\n");});
    mcglut->setRenderCallback([](){SceneRender();});
    mcglut->setKeyEventCallback([](int state,int key){
//        printf("keyEvent: %d %d\n", state, key);
        if (state==0 && key==13) {
            g_Game.Networking()->SendNick("me", 0);
        }
    });
    mcglut->setMouseEventCallback([](int state,int x, int y, int button){
//        printf("mouseEvent: %d %d %d %d\n", state, x, y, button);
        if (state==3) {
            g_Game.Mouse()->SetMousePosition(x, y);
        }
        if (state==1 && button==1) {
            if(g_Game.IsPlayerAlive() && g_Game.Rendering()->CanShoot())
            {
                g_Game.Networking()->WriteByte(OUT_SHOOT);
            }
        }
    });
    mcglut->initWindow(0, 0, 800, 480, false);
    g_Screen.width = 800;
    g_Screen.height = 480;
    s_MainCtx = Context::FromCanvas("canvas");
#endif
    
    ImageInit();
	
#ifdef EMSCRIPTEN
	if(EM_ASM_INT_V({ return !window.location || !window.location.hostname; })){
		Debug("No window.location");
		return 1;
	}
#endif
	
#ifdef EMSCRIPTEN
	char *hostnamer = (char*) EM_ASM_INT_V({ return allocateUTF8(window.location.hostname); });
	std::string hostname = hostnamer;
	free(hostnamer);
	#ifndef DEBUG
		/*if(hostname != "agar.io" && hostname != "localhost" && hostname != "staging-web.agar.io" && hostname != "flash-web-dev1-eu-central-1.agario.miniclippt.com"){
			Debug("Invalid location hostname, add it to the whitelist in main.cpp");
			return 1;
		}*/
	#endif
#endif
    
#define DEBUG_SIZE(x) Debug("sizeof(%s) = %d", #x, int(sizeof(x)));
	DEBUG_SIZE(char);
	DEBUG_SIZE(int);
	DEBUG_SIZE(size_t);
	DEBUG_SIZE(float);
	DEBUG_SIZE(double);
	DEBUG_SIZE(Game);
	DEBUG_SIZE(Cell);
	DEBUG_SIZE(Text);
	DEBUG_SIZE(Context);
	DEBUG_SIZE(Image);
	DEBUG_SIZE(WebSocket);
	
#ifdef EMSCRIPTEN
	emscripten_set_main_loop(draw, 0, false);
#endif
	cp5::idle_callback(idle);
	cp5::check_ws_callback(check_maestro_ws);
	
#ifdef EMSCRIPTEN
	// We never actually exit when we leave main
	emscripten_exit_with_live_runtime();
#endif
    
#ifdef TARGET_OS_MAC
    SceneInit();
    Game::Reset();
    g_Game.Networking()->GetMaestroConnectionHandler().ConnectToMaestro("ws://localhost:8080/ws");
    mcglut->mainLoop();
    while (true) {
        sleep(1);
        idle();
        check_maestro_ws();
        draw();
    }
    printf("exit\n");
#endif
}

#ifdef EMSCRIPTEN
extern "C" {

	EMSCRIPTEN_KEEPALIVE void ac_reconnect(const char *maestroIp){
		Game::Reset();
		g_Game.Networking()->GetMaestroConnectionHandler().ConnectToMaestro(maestroIp);
	}

	EMSCRIPTEN_KEEPALIVE void ac_connect_to_maestro(const char *maestroIp){
		g_Game.Networking()->GetMaestroConnectionHandler().ConnectToMaestro(maestroIp);
	}
	
	EMSCRIPTEN_KEEPALIVE void ac_set_player_name(const char *str, int selectedSet){
		g_Game.Networking()->SendNick(str, selectedSet);
	}

	// x and y in the main canvas, we'll translate it. If you're scaling the canvas using css, you need to pass us
	// unscaled coordinates, as in, between 0 and canvas.width
	EMSCRIPTEN_KEEPALIVE void ac_set_mouse_position(int32_t x, int32_t y){
		g_Game.Mouse()->SetMousePosition(x, y);
	}
	
	EMSCRIPTEN_KEEPALIVE void ac_shoot(){
		if(g_Game.IsPlayerAlive() && g_Game.Rendering()->CanShoot())
		{
			g_Game.Networking()->WriteByte(OUT_SHOOT);
		}
	}
	
	EMSCRIPTEN_KEEPALIVE void ac_toggle_autofire(bool autofire){
		g_Game.Rendering()->SetIsInAutofire(autofire);
		g_Game.Networking()->SendAutofireInformation(autofire);
	}
    
    EMSCRIPTEN_KEEPALIVE void ac_split_and_dash(){
        g_Game.Networking()->SendSplitAndDashOrder();
    }

	EMSCRIPTEN_KEEPALIVE void ac_send_enter_game_request(const char* arenaLink, bool hasNewArenaLink){
        g_Game.Networking()->GetMaestroConnectionHandler().SortOutgoingEnterGameRequests(arenaLink, hasNewArenaLink);
    }

	EMSCRIPTEN_KEEPALIVE bool ac_is_arena_closing(){
        return g_Game.IsArenaClosing();
    }

	EMSCRIPTEN_KEEPALIVE double ac_get_match_duration(){
        return g_Game.Stats()->GetMatchDuration();
    }

	EMSCRIPTEN_KEEPALIVE double ac_get_top_position(){
        return g_Game.Stats()->GetTopPosition();
    }

	EMSCRIPTEN_KEEPALIVE double ac_get_final_position(){
        return g_Game.Stats()->GetCurrentPosition();
    }
    
#ifdef DEBUG
    EMSCRIPTEN_KEEPALIVE void ac_toggle_debug(){
        g_Game.Rendering()->ToggleDebug();
    }

    EMSCRIPTEN_KEEPALIVE void ac_toggle_assets_rendering(){
        g_Game.Rendering()->ToggleSprites();
    }

    EMSCRIPTEN_KEEPALIVE void ac_test_message(){
        g_Game.Networking()->CreateTestMessage();
    }
#endif
	
	EMSCRIPTEN_KEEPALIVE void ac_zoom(double amount){
		g_Game.Rendering()->UserZoom(amount);
	}
	
	EMSCRIPTEN_KEEPALIVE void ac_spectate(){
		g_Game.Networking()->Spectate();
	}
	
	EMSCRIPTEN_KEEPALIVE void ac_disconnect(){
		Debug("Core disconnect was called");
		g_Game.OnDisconnect(true, false);
		g_Game.Networking()->CloseMaestroSocket();
	}

	EMSCRIPTEN_KEEPALIVE void ac_pixi_render(){
		Debug("PIXI RENDER!");
		g_Game.Rendering()->RenderPlayerNamePixi();
		g_Game.Rendering()->RenderBackgroundPixi();
	}
	
	EMSCRIPTEN_KEEPALIVE void ac_every_second(){
		g_Game.Rendering()->EverySecond();
		g_Game.Cells()->EverySecond();
		g_Game.Networking()->EverySecond();
	}

	EMSCRIPTEN_KEEPALIVE void ac_set_graphics(const char* settings){
		g_Game.Rendering()->SetGraphics(settings);
	}
}
#endif
