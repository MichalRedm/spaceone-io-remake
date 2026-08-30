#include <cp5/WebSocket.h>

namespace cp5 {
	
WebSocket::WebSocket(const char *ip){
	ws = EM_ASM_INT({
		var ws = new WebSocket(UTF8ToString($0));
		ws.binaryType = "arraybuffer";
		ws.events = [];
		ws.onopen = function(){
			ws.events.push([2, 0, 0]);
			_cp5_check_ws();
		};
		
		ws.onerror = function(){
			ws.events.push([3, 0, 0]);
			_cp5_check_ws();
		};
		
		ws.onclose = function(){
			ws.events.push([4, 0, 0]);
			_cp5_check_ws();
		};
		
		ws.onmessage = function(e){
			var view = new Uint8Array(e.data);
			var ptr = _malloc(view.length);
			writeArrayToMemory(view, ptr);
			ws.events.push([1, ptr, view.length]);
			_cp5_check_ws();
		};
		
		for(var i = 0; i < cp5.sockets.length; ++i){
			if(cp5.sockets[i] != null) continue;
			cp5.sockets[i] = ws;
			return i;
		}
		
		cp5.sockets.push(ws);
		return cp5.sockets.length - 1;
	}, ip);
}

WebSocket::~WebSocket(){
	EM_ASM_ARGS({
		cp5_destroy_ws($0);
	}, ws);
}

bool WebSocket::IsConnected(){
	return EM_ASM_INT({
		return cp5.sockets[$0].readyState == 1;
	}, ws);
}

void WebSocket::Write(const char *data, int len){
	EM_ASM_INT({
		var w = cp5.sockets[$0];
		if(w.readyState != 1) return 0;
		w.send(HEAP8.subarray($1, $1 + $2));
		return 1;
	}, ws, data, len);
}

ws_event WebSocket::Poll(char **data, int *len){
	return (ws_event) EM_ASM_INT({
		var w = cp5.sockets[$0];
		
		if(w.events.length == 0) return 0;
		
		var e = w.events.shift();
		HEAPU32[$1 >> 2] = e[1];
		HEAP32[$2 >> 2] = e[2];
		return e[0];
	}, ws, data, len);
}


namespace {
	void (*s_CheckWSCallback)();
}

void check_ws_callback(void(*f)()){
	s_CheckWSCallback = f;
}

extern "C" EMSCRIPTEN_KEEPALIVE void cp5_check_ws(){
	if(s_CheckWSCallback) s_CheckWSCallback();
}

}

