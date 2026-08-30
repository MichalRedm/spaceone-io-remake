#include "BinData.h"
#include "Interface.h"
#include "Utils.h"
#include <cp5/Context.h>
#include "libs/mc5/include/cp5/Text.h"
#include "libs/mc5/include/cp5/Image.h"

class IGameNetworking
{
    public:

        void OnDisconnect(bool forcedDisconnect = false, bool isReconnection = false);
        void OnData(const char *data, int len);
        void ConnectToGameServer(const char *ip);
        void OnConnectedToGameServer();
        void ConnectionFailsafe();
        void LogDownload(size_t len);
        void LogUpload(size_t len);
};
