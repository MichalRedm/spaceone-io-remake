#ifndef FLEET__H
#define FLEET__H

#pragma once

class Game;
class Cell;
class Fleet {
public:
    //Constructors
	Fleet(uint32_t id, float bcx, float bcy, const Color &color) :
        m_iID(id),
        m_fOldBoidCenterX(bcx),
        m_fOldBoidCenterY(bcy),
        m_fBoidCenterX(bcx),
        m_fBoidCenterY(bcy),
        m_fNewBoidCenterX(bcx),
        m_fNewBoidCenterY(bcy),
        m_Color(color) {}

    //~Fleet(){ Debug("Running Destructor for fleet with ID: %u", m_iID); }
	
    //Getters
        //Inline
    inline uint32_t GetID() const { return m_iID; }
    inline size_t GetFleetSize() { return m_MyFleet.size(); }
    inline uint16_t GetFleetSizeOnServer() { return m_iFleetSizeOnServer; }
    inline float GetBoidCenterX() const { return m_fBoidCenterX; }
    inline float GetBoidCenterY() const { return m_fBoidCenterY; }
    inline float GetFrontX() const { return m_fBoidFrontX; }
    inline float GetFrontY() const { return m_fBoidFrontY; }
    inline uint8_t GetSelectedSet() { return m_iSelectedSet; }
    inline bool IsSpawnProtected() { return m_bIsSpawnProtected; }
    inline bool IsDestroyed() { return m_bDestroyed; }
    inline bool IsDashing() { return m_bIsDashing; }
    inline std::vector<Cell*> GetMyFleet() { return m_MyFleet; }
    inline const std::string& GetName() const { return m_Name; }
	inline const Color& GetColor(){ return m_Color; }
    inline int GetLeaderboardPosition() { return m_iLeaderboardPosition; }
	inline int GetScore() { return m_iScore; }
    inline int32_t GetDashTicks() { return m_iDashTicks; }
        //Non-Inline
    size_t GetFleetSizeWithoutBullets();

    //Setters
    inline void SetName(const std::string &v) { m_Name = v; m_NameText.SetValue(v); }
    inline void SetFleetSizeOnServer(uint16_t fleetSizeOnServer) { m_iFleetSizeOnServer = fleetSizeOnServer; }
    inline void SetFleetCentralPosition(double centerX, double centerY) { m_fBoidCenterX = centerX; m_fBoidCenterY = centerY; }
    inline void SetFleetFrontPosition(double frontX, double frontY) { m_fBoidFrontX = frontX; m_fBoidFrontY = frontY; }
    inline void SetFleetFrontTransversalPosition(double frontTX, double frontTY) { m_fBoidFrontTX = frontTX; m_fBoidFrontTY = frontTY; }
    inline void SetColor(const Color &color){ m_Color = color; }
    inline void SetIsSpawnProtected(bool v){ m_bIsSpawnProtected = v; }
    inline void SetLeaderboardPosition(int position) { m_iLeaderboardPosition = position; }
    inline void SetScore(int score) { m_iScore = score; }
	inline void SetSelectedSet(uint8_t selectedSet) { m_iSelectedSet = selectedSet; }
    inline void SetIsDashing(bool isDashing) { m_bIsDashing = isDashing; }
    inline void SetDashTicks(int32_t dashTicks) { m_iDashTicks = dashTicks; }
    inline void SetFront(bool draw, float fX, float fY, float ftX, float ftY) { m_bDrawFront = draw; m_fBoidFrontX = fX; m_fBoidFrontY = fY; m_fBoidFrontTX = ftX; m_fBoidFrontTY = ftY; }

    //Other Inline funcs
    inline void BlockFurtherUpdates(){ m_bCanReceiveUpdate = false; }
    inline void StopDrawFront() { m_bDrawFront = false; }

    //Other Non-Inline funcs
    void RemoveCellFromFleet(Cell *cell);
    void ClearAllCells();
    void AddCellToFleet(Cell *cell);
    void Update(float newBcX, float newBcY);
    void UpdatePos();
    double GetInterpolationTime();
	double CalcVelocityNorm();
    void SortRender();
    void Render(Context *ctx);

#ifdef DEBUG
    void ConservativeDebugRender(Context* ctx);
#endif
    void ConservativeRenderTexts(Context* ctx);
	void RenderTexts(Context *ctx);
	
private:
	inline int GetNameSize(){ return 26; }
	
	uint32_t m_iID;
    uint16_t m_iFleetSizeOnServer;
    bool m_bDrawFront = false;
    float m_fBoidFrontX;
    float m_fBoidFrontY;
    float m_fBoidFrontTX;
    float m_fBoidFrontTY;
	bool m_bDestroyed = false;
	bool m_bCanReceiveUpdate = true;
    bool m_bAddedNewCellToFleet = true;
    float m_fOldBoidCenterX;
    float m_fOldBoidCenterY;
    float m_fBoidCenterX;
    float m_fBoidCenterY;
    float m_fNewBoidCenterX;
    float m_fNewBoidCenterY;

    double m_fUpdateTime = 0.0;

	int m_iLeaderboardPosition = 0;
	int m_iScore = 0;
	uint8_t m_iSelectedSet = 0;
    int32_t m_iDashTicks = 0;
	
	Color m_Color;
	std::string m_Name;
	Text m_NameText{0, Color(255, 255, 255), true, Color{0, 0, 0}};
	Text m_SizeText{0, Color(255, 255, 255), true, Color{0, 0, 0}};

    std::vector<Cell*> m_MyFleet;

    bool m_bIsSpawnProtected = false;
    bool m_bIsDashing = false;
};

#endif