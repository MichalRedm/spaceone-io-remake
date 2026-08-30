#ifndef GAMECONFIGURATION__H
#define GAMECONFIGURATION__H
#pragma once

class Game;
class GameConfiguration {
public:
	GameConfiguration(){}
    
    inline bool IsDrawStarfieldEnabled(){ return m_bDrawStarfield; }
    inline bool IsInterpolatingEnabled(){ return m_bInterpolating; }
    
    inline void SetDrawStarfieldEnabled(bool v){ m_bDrawStarfield = v; }
    inline void SetInterpolatingEnabled(bool v){ m_bInterpolating = v; }
    
    inline void SetConfigVersion(std::string v) { m_sConfigVersion = v; }
    inline const std::string& GetConfigVersion() { return m_sConfigVersion; };
	
private:    
    bool m_bDrawStarfield = false;
    bool m_bInterpolating = false;
    std::string m_sConfigVersion = "0.0";
};

#endif