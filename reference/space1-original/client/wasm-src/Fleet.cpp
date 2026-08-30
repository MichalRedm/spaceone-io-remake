#include "Fleet.h"
#include "Game.h"
#include "Cell.h"

#define INTERP_TIME 100.0

void Fleet::Render(Context *ctx)
{
    if(m_bDestroyed) return;
    if(m_bAddedNewCellToFleet)
    {
        SortRender();
        m_bAddedNewCellToFleet = false;
    }

    for(Cell* cell : m_MyFleet)
    {
        if(cell == nullptr || cell->IsBeingDestroyed()) continue;
        cell->Render(ctx);
    }

    /*ctx->Save();
    ctx->BeginPath();
    ctx->MoveTo(g_Game.Mouse()->GameX(), g_Game.Mouse()->GameY());
    ctx->LineTo(m_fBoidCenterX, m_fBoidCenterY);
    ctx->ClosePath();
    ctx->SetLineWidth(10);
    ctx->StrokeColor(Color(0xFF, 0x00, 0x00));
    ctx->Stroke();*/
    /*ctx->Arc(m_fBoidFrontX, m_fBoidFrontY, 5, -M_PI, M_PI, false);
    ctx->ClosePath();
    ctx->BeginPath();
    ctx->Arc(m_fBoidCenterX, m_fBoidCenterY, 5, -M_PI, M_PI, false);
    
    ctx->FillColor(Color(0x00, 0xFF, 0x00));
    ctx->Fill();*/
    //ctx->Restore();
}

void Fleet::ConservativeRenderTexts(Context* ctx)
{
    ctx->Save();
        RenderTexts(ctx);
    ctx->Restore();
}

void Fleet::RenderTexts(Context *ctx)
{
    if(m_Name.empty()) return;
    if(m_bDestroyed) return;
    UpdatePos();
    if(g_Game.Cells()->GetMyFleet() == this) return;

    m_NameText.SetSize(GetNameSize());
    
    int w = m_NameText.Width();
    int h = m_NameText.Height();

    double radius = sqrt(m_fBoidFrontY*m_fBoidFrontY + m_fBoidFrontX*m_fBoidFrontX);
    int textPos = std::ceil(m_fBoidCenterY - radius * 0.85);

    ctx->Translate(m_fBoidCenterX, textPos);
    //ctx->Translate(m_fBoidCenterX, m_fBoidCenterY);
    ctx->DrawImage(m_NameText.Render(), - w / 2, - h / 2, w, h);

    //Debug("Rendering name for fleet with Name: %s [X: %f, Y: %f]", m_Name.c_str(), m_fBoidCenterX, textPos);
}

double Fleet::GetInterpolationTime()
{
    return Clamp((g_Game.Now() - m_fUpdateTime) / INTERP_TIME, 0.0, 1.0);
}

void Fleet::UpdatePos()
{
	double t = GetInterpolationTime();

	m_fBoidCenterX = t * (m_fNewBoidCenterX - m_fOldBoidCenterX) + m_fOldBoidCenterX;
    m_fBoidCenterY = t * (m_fNewBoidCenterY - m_fOldBoidCenterY) + m_fOldBoidCenterY;
}

void Fleet::Update(float newBcX, float newBcY)
{
	if(!m_bCanReceiveUpdate) return;
    UpdatePos();

    m_fOldBoidCenterX = m_fBoidCenterX;
    m_fOldBoidCenterY = m_fBoidCenterY;

    m_fNewBoidCenterX = newBcX;
    m_fNewBoidCenterY = newBcY;

    m_fUpdateTime = g_Game.Now();
}

void Fleet::RemoveCellFromFleet(Cell *cell)
{ 
    if(cell == nullptr) return;
    if(m_MyFleet.empty()) return;

    auto cellToErase = std::find(m_MyFleet.begin(), m_MyFleet.end(), cell);
    if(cellToErase != m_MyFleet.end())
    {
        m_MyFleet.erase(cellToErase);

        if(cell->IsValidBoid())
        {
            //Debug("Removed Cell with Cell ID: %d, from fleet with Name: %s", cell->GetID(), m_Name.c_str());
            //Debug("[Fleet size after removal: %zu] (without Bullet) from [Fleet: %s]", GetFleetSizeWithoutBullets(), m_Name.c_str());
        }        

        if(cell->IsBullet())
        {
            //Debug("[Fleet size after removal: %zu] (WITH Bullet) from [Fleet: %s]", GetFleetSizeWithoutBullets(), m_Name.c_str());
        }

        if(GetFleetSize() == 0 || GetFleetSizeOnServer() == 0)
        {
            //Debug("My Fleet size is 0, will remove this fleet (%s)", m_Name.c_str());
            //If there are any leftover bullets in the fleet, I should set the fleet to nullptr on them
            for(auto cell : m_MyFleet)
            {
                cell->SetFleet(nullptr);
            }
            g_Game.Cells()->RemoveFleet(this);
        }
    }
    else
    {
        //Debug("I couldn't find Cell: %u in this Fleet! (%s). IsBullet? : %d", cell->GetID(), m_Name.c_str(), cell->IsBullet());
    }
}

void Fleet::ClearAllCells()
{
    m_MyFleet.clear();
}

void Fleet::AddCellToFleet(Cell *cell)
{
    if(std::find(m_MyFleet.begin(), m_MyFleet.end(), cell) == m_MyFleet.end())
    {
        m_MyFleet.push_back(cell);
        if(!cell->IsBullet())
        {
            //Debug("Added new cell to fleet (%s) with ID: %d", m_Name.c_str(), cell->GetID());
        }
        m_bAddedNewCellToFleet = true;
    }
    else
    {
        //Debug("I already had cell with ID: %d", cell->GetID());
    }

}

void Fleet::SortRender()
{
    std::sort(m_MyFleet.begin(), m_MyFleet.end(), [](const Cell *cellA, const Cell *cellB)
    {
        if (cellA->IsBullet() && cellB->IsValidBoid())
            return true;
        else if (cellA->IsValidBoid() && cellB->IsBullet())
            return false;
        else
            return cellA->GetRadius() < cellB->GetRadius();
    });
}

size_t Fleet::GetFleetSizeWithoutBullets()
{
    size_t numCellsInFleet = 0;

    for(auto cell : m_MyFleet)
    {
        if(cell == nullptr) continue;
        if(cell->IsValidBoid()) numCellsInFleet++;
    }

    return numCellsInFleet;
}

#ifdef DEBUG

void Fleet::ConservativeDebugRender(Context* ctx)
{
    if ( !m_bDrawFront ) return;
    ctx->Save();
    
    double radius = sqrt(m_fBoidFrontY*m_fBoidFrontY + m_fBoidFrontX*m_fBoidFrontX);
    ctx->BeginPath();
    ctx->Arc(m_fBoidCenterX, m_fBoidCenterY, radius, 0, M_PI * 2, false);
    ctx->SetLineWidth(1);
    ctx->Stroke();
    
    ctx->BeginPath();
    ctx->MoveTo(m_fBoidCenterX, m_fBoidCenterY);
    ctx->LineTo(m_fBoidFrontX + m_fBoidCenterX, m_fBoidFrontY + m_fBoidCenterY);
    ctx->StrokeColor(Color(0,0,255));
    ctx->SetLineWidth(1);
    ctx->Stroke();
    
    ctx->BeginPath();
    ctx->MoveTo(m_fBoidFrontTX + m_fBoidFrontX + m_fBoidCenterX, m_fBoidFrontTY + m_fBoidFrontY + m_fBoidCenterY);
    ctx->LineTo(- m_fBoidFrontTX + m_fBoidFrontX + m_fBoidCenterX, - m_fBoidFrontTY + m_fBoidFrontY + m_fBoidCenterY);
    ctx->StrokeColor(Color(0,255,255));
    ctx->SetLineWidth(1);
    ctx->Stroke();
    
    ctx->Restore();
}

#endif