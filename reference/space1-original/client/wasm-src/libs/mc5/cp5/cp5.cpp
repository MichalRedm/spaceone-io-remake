#include <cp5/Interface.h>

namespace {
	void (*s_IdleCallback)();
}

namespace cp5 {
	
	
	bool has_idle_time_left(){
		return EM_ASM_INT_V({ return idleDeadline['timeRemaining']() >= 2; });
	}
	
	double random(){
		return EM_ASM_DOUBLE_V({ return Math.random(); });
	}
	
	void idle_callback(void(*f)()){
		s_IdleCallback = f;
	}

}

extern "C" EMSCRIPTEN_KEEPALIVE void cp5_idle(){
	if(s_IdleCallback) s_IdleCallback();
}

extern "C" EMSCRIPTEN_KEEPALIVE void cp5_destroy(){
	emscripten_force_exit(0);
}
