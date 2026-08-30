
#include <algorithm>

#include <google/protobuf/stubs/common.h>
#include <google/protobuf/stubs/once.h>
#include <google/protobuf/io/coded_stream.h>
#include <google/protobuf/wire_format_lite_inl.h>
#include <google/protobuf/descriptor.h>
#include <google/protobuf/generated_message_reflection.h>
#include <google/protobuf/reflection_ops.h>
#include <google/protobuf/wire_format.h>

namespace maestro {
namespace user_proto {

namespace {

const ::google::protobuf::Descriptor* ping_descriptor_ = NULL;
const ::google::protobuf::internal::GeneratedMessageReflection*
  ping_reflection_ = NULL;
const ::google::protobuf::Descriptor* pong_descriptor_ = NULL;
const ::google::protobuf::internal::GeneratedMessageReflection*
  pong_reflection_ = NULL;
const ::google::protobuf::Descriptor* create_session_request_descriptor_ = NULL;
const ::google::protobuf::internal::GeneratedMessageReflection*
  create_session_request_reflection_ = NULL;
const ::google::protobuf::Descriptor* create_session_response_descriptor_ = NULL;
const ::google::protobuf::internal::GeneratedMessageReflection*
  create_session_response_reflection_ = NULL;
const ::google::protobuf::Descriptor* disconnect_descriptor_ = NULL;
const ::google::protobuf::internal::GeneratedMessageReflection*
  disconnect_reflection_ = NULL;
const ::google::protobuf::EnumDescriptor* disconnect_reason_enum_descriptor_ = NULL;
const ::google::protobuf::Descriptor* geo_location_request_descriptor_ = NULL;
const ::google::protobuf::internal::GeneratedMessageReflection*
  geo_location_request_reflection_ = NULL;
const ::google::protobuf::Descriptor* geo_location_response_descriptor_ = NULL;
const ::google::protobuf::internal::GeneratedMessageReflection*
  geo_location_response_reflection_ = NULL;
const ::google::protobuf::Descriptor* enter_game_request_descriptor_ = NULL;
const ::google::protobuf::internal::GeneratedMessageReflection*
  enter_game_request_reflection_ = NULL;
const ::google::protobuf::Descriptor* enter_game_response_descriptor_ = NULL;
const ::google::protobuf::internal::GeneratedMessageReflection*
  enter_game_response_reflection_ = NULL;
const ::google::protobuf::EnumDescriptor* enter_game_response_gameserver_connection_type_descriptor_ = NULL;
const ::google::protobuf::Descriptor* gameserver_passthrough_descriptor_ = NULL;
const ::google::protobuf::internal::GeneratedMessageReflection*
  gameserver_passthrough_reflection_ = NULL;
const ::google::protobuf::Descriptor* game_over_descriptor_ = NULL;
const ::google::protobuf::internal::GeneratedMessageReflection*
  game_over_reflection_ = NULL;
const ::google::protobuf::EnumDescriptor* game_over_reason_enum_descriptor_ = NULL;
const ::google::protobuf::Descriptor* msg_descriptor_ = NULL;
const ::google::protobuf::internal::GeneratedMessageReflection*
  msg_reflection_ = NULL;
const ::google::protobuf::Descriptor* envelope_descriptor_ = NULL;
const ::google::protobuf::internal::GeneratedMessageReflection*
  envelope_reflection_ = NULL;
const ::google::protobuf::EnumDescriptor* envelope_content_type_enum_descriptor_ = NULL;
const ::google::protobuf::EnumDescriptor* user_platform_enum_descriptor_ = NULL;

}  // namespace


// @@protoc_insertion_point(namespace_scope)

}  // namespace user_proto
}  // namespace maestro

// @@protoc_insertion_point(global_scope)
